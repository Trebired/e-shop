type StorefrontPage = "account" | "cart" | "catalog" | "checkout" | "order" | "product" | "reset";

type StorefrontRoutes = Record<StorefrontPage, string>;

type StorefrontSettings = { catalog: { categories: boolean; pageSize: number }; preset: "preset_01"; routes: StorefrontRoutes };

type StorefrontMatch = { page: StorefrontPage; param: string };

const STOREFRONT_PAGES: readonly StorefrontPage[] = ["catalog", "product", "cart", "checkout", "order", "account", "reset"];
const STOREFRONT_ROUTES: StorefrontRoutes = {
  account: "/account",
  cart: "/cart",
  catalog: "/",
  checkout: "/checkout",
  order: "/order/{token}",
  product: "/products/{slug}",
  reset: "/account/reset/{token}",
};
const STOREFRONT_HOLE = "_";
const PLACEHOLDER = /\{(slug|token)\}$/u;
const PARAM = /^[A-Za-z0-9_-]{1,200}$/u;

function trimmed(path: string): string {
  return path.replace(/\/+$/u, "") || "/";
}

function matchStorefrontRoute(settings: StorefrontSettings, pathname: string): StorefrontMatch | null {
  const path = trimmed(pathname);
  let found: StorefrontMatch | null = null;
  for (const page of STOREFRONT_PAGES) {
    const route = settings.routes[page];
    if (!PLACEHOLDER.test(route)) {
      if (trimmed(route) === path && !found) found = { page, param: "" };
      continue;
    }
    const prefix = route.replace(PLACEHOLDER, "");
    const rest = path.startsWith(prefix) ? path.slice(prefix.length) : "";
    const param = rest ? decodeURIComponent(rest) : "";
    if (PARAM.test(param) && (!found || found.param === "")) found = { page, param };
  }
  if (found?.param === STOREFRONT_HOLE) found.param = "";
  return found;
}

function storefrontPath(settings: StorefrontSettings, page: StorefrontPage, param = ""): string {
  return settings.routes[page].replace(PLACEHOLDER, encodeURIComponent(param || STOREFRONT_HOLE));
}

function storefrontShellPaths(settings: StorefrontSettings): string[] {
  return [...new Set(STOREFRONT_PAGES.map((page) => storefrontPath(settings, page)))];
}

export { matchStorefrontRoute, STOREFRONT_HOLE, STOREFRONT_PAGES, STOREFRONT_ROUTES, storefrontPath, storefrontShellPaths };
export type { StorefrontMatch, StorefrontPage, StorefrontRoutes, StorefrontSettings };
