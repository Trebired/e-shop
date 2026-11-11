import { EshopError } from "./../errors.js";

const GATEWAY_TIMEOUT_MS = 15000;

type GatewayRequest = {
  auth: string;
  body?: Record<string, unknown>|URLSearchParams;
  method?: string;
  url: string;
};

function gatewayFailed(gateway: string, details: Record<string, unknown> = {}): EshopError {
  return new EshopError(502, "eshop-gateway-failed", { gateway, ...details });
}

async function gatewayRequest<T>(gateway: string, input: GatewayRequest): Promise<T> {
  const form = input.body instanceof URLSearchParams;
  const headers: Record<string, string> = { accept: "application/json", authorization: input.auth };
  if (input.body) headers["content-type"] = form ? "application/x-www-form-urlencoded" : "application/json";
  let response: Response;
  try {
    response = await fetch(input.url, {
        body: input.body ? (form ? String(input.body) : JSON.stringify(input.body)) : undefined,
        headers,
        method: input.method ?? (input.body ? "POST" : "GET"),
        signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
  } catch {
    throw gatewayFailed(gateway, { reason: "unreachable" });
  }
  const json = (await response.json().catch (() => null)) as T | null;
  if (!response.ok || !json) throw gatewayFailed(gateway, { status: response.status });
  return json;
}

function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

export { basicAuth, gatewayFailed, gatewayRequest };
