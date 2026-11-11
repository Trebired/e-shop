import { EshopError } from "./errors.js";

type Request = any;
type Response = any;
type RouteContext = {
  body: () => Promise<Buffer>;
  json: () => Promise<any>;
  params: Record<string, string>;
  query: URLSearchParams;
  req: Request;
  res: Response;
};
type Route = { handler: (context: RouteContext) => Promise<unknown>; method: string; pattern: RegExp; keys: string[] };

const MAX_BODY_BYTES = 1024 * 1024;

function compile(method: string, path: string, handler: Route["handler"]): Route {
  const keys: string[] = [];
  const source = path.replace(/:(\w+)/gu, (_, key: string) => {
      keys.push(key);
      return "([^/]+)";
  });
  return { handler, keys, method, pattern: new RegExp(`^${source}$`, "u") };
}

async function readBody(req: Request): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body !== undefined && req.body !== null && typeof req.body === "object" && Object.keys(req.body).length) {
    throw new EshopError(500, "eshop-body-already-parsed");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new EshopError(413, "eshop-body-too-large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sendJson(res: Response, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

function sendPdf(res: Response, filename: string, pdf: Buffer): void {
  res.statusCode = 200;
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `inline; filename="${filename.replace(/[^\w.-]/gu, "_")}"`);
  res.setHeader("cache-control", "private, no-store");
  res.end(pdf);
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof EshopError) return sendJson(res, error.status, { details: error.details, error: error.code });
  return sendJson(res, 500, { error: "eshop-internal-error" });
}

function createRouter(prefix: string) {
  const routes: Route[] = [];
  const add = (method: string, path: string, handler: Route["handler"]) => routes.push(compile(method, `${prefix}${path}`, handler));
  const match = (method: string, path: string) => {
    for (const route of routes) {
      const found = route.method === method ? route.pattern.exec(path) : null;
      if (found) return { params: Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(found[index + 1] as string)])), route };
    }
    return null;
  };
  return { add, match, routes };
}

async function dispatch(router: ReturnType<typeof createRouter>, req: Request, res: Response): Promise<boolean> {
  const url = new URL(String(req.originalUrl ?? req.url), "http://local");
  const found = router.match(String(req.method).toUpperCase(), url.pathname);
  if (!found) return false;
  let cached: Buffer | null = null;
  const body = async() => (cached ??= await readBody(req));
  const context: RouteContext = {
    body,
    json: async() => {
      if (!String(req.headers?.["content-type"] ?? "").toLowerCase().startsWith("application/json")) throw new EshopError(415, "eshop-json-required");
      const raw = await body();
      if (!raw.length) return {};
      try {
        return JSON.parse(raw.toString("utf8"));
      } catch {
        throw new EshopError(400, "eshop-json-invalid");
      }
    },
    params: found.params,
    query: url.searchParams,
    req,
    res,
  };
  try {
    const result = await found.route.handler(context);
    if (!res.headersSent) sendJson(res, 200, result ?? { ok: true });
  } catch (error) {
    if (!res.headersSent) sendError(res, error);
  }
  return true;
}

function readCookie(req: Request, name: string): string {
  const header = String(req.headers?.cookie ?? "");
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function setCookie(res: Response, name: string, value: string, maxAgeDays: number, secure: boolean): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeDays * 86400}`];
  if (secure) parts.push("Secure");
  const current = res.getHeader?.("set-cookie");
  const list = Array.isArray(current) ? current : current ? [String(current)] : [];
  res.setHeader("set-cookie", [...list.filter((cookie: string) => !cookie.startsWith(`${name}=`)), parts.join("; ")]);
}

export { createRouter, dispatch, readCookie, sendJson, sendPdf, setCookie };
export type { RouteContext };
