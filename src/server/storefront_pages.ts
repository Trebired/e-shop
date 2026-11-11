import fs from "node:fs";
import path from "node:path";
import type { NormalizedEshopConfig } from "./../config/types.js";
import { matchStorefrontRoute, storefrontPath } from "./../storefront.js";

const HTML = "text/html; charset=utf-8";

function storefrontPageServer(config: NormalizedEshopConfig, distDir: string | undefined) {
  if (!distDir || !config.storefront) return null;
  const root = path.resolve(distDir);
  const settings = config.storefront;
  return (req: any, res: any): boolean => {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    const pathname = new URL(String(req.originalUrl ?? req.url), "http://local").pathname;
    const match = matchStorefrontRoute(settings, pathname);
    if (!match) return false;
    const file = path.join(root, storefrontPath(settings, match.page), "index.html");
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) return false;
    res.statusCode = 200;
    res.setHeader("content-type", HTML);
    res.setHeader("cache-control", "no-cache");
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
    return true;
  };
}

export { storefrontPageServer };
