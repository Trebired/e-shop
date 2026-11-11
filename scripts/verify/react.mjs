import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveLogger } from "@package/logger-adapter";

const log = resolveLogger({ source: "@trebired/e-shop" });
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const react = await import(pathToFileURL(path.join(rootDir, "dist", "react", "index.js")).href);

const PRODUCT = {
  categoryId: null, createdAt: "", description: { cs: "Popis", en: "Text" }, id: "p1", images: [{ alt: "Hrnek", src: "/m.webp" }],
  name: { cs: "Hrnek", en: "Mug" }, slug: "hrnek", status: "active", updatedAt: "", vatRate: 21,
  variants: [
    { active: true, id: "v1", name: { cs: "Modrý" }, position: 0, priceMinor: 25000, productId: "p1", sku: "MUG", stock: 0, weightGrams: 0 },
  ],
};

function render(node) {
  return renderToStaticMarkup(createElement(react.EshopProvider, { locale: "cs" }, node));
}

const grid = render(createElement(react.ProductGrid, { currency: "CZK", productHref: (product) => `/p/${product.slug}`, products: [PRODUCT] }));

assert.match(grid, /href="\/p\/hrnek"/u, "a product card links to its page");
assert.match(grid, /250,00\s?Kč/u, "the price is formatted in the shop currency and locale");
assert.match(grid, /class="[^"]*tbf-grid/u, "classes come from the namespace helpers");

const detail = render(createElement(react.ProductDetail, { currency: "CZK", product: PRODUCT }));

assert.match(detail, /Vyprodáno/u, "a variant without stock shows as sold out");
assert.match(detail, /disabled/u, "a sold out variant cannot be added");
assert.equal(react.storefrontCopy("xx").cart, "Cart", "an unknown locale falls back to English");

const root = await import(pathToFileURL(path.join(rootDir, "dist", "index.js")).href);
const config = await import(pathToFileURL(path.join(rootDir, "dist", "config", "index.js")).href);
const frontendReact = await import("@trebired/frontend/react");
const SHOP = { forVersion: "0.6.0", shop: { locales: ["cs", "en"], name: "Verify" }, storefront: {} };

function verifyRoutes() {
  const settings = config.normalizeConfig(SHOP).storefront;
  const match = (pathname) => root.matchStorefrontRoute(settings, pathname);
  assert.deepEqual(match("/products/hrnek"), { page: "product", param: "hrnek" }, "a product address names its slug");
  assert.deepEqual(match("/products/_"), { page: "product", param: "" }, "the built page shell has no slug");
  assert.deepEqual(match("/cart/"), { page: "cart", param: "" }, "a trailing slash matches");
  assert.deepEqual(match("/"), { page: "catalog", param: "" }, "the catalog sits at the root by default");
  assert.equal(match("/products/a/b"), null, "a deeper address is not a product");
  assert.equal(match("/blog"), null, "other addresses belong to the app");
  const custom = config.normalizeConfig({ ...SHOP, storefront: { routes: { catalog: "/shop", product: "/shop/p/{slug}" } } });
  assert.equal(root.storefrontPath(custom.storefront, "product", "hrnek"), "/shop/p/hrnek", "routes come from the config");
  assert.equal(custom.orders.statusPath, "/order/{token}", "order links follow the storefront order route");
  const broken = () => config.normalizeConfig({ ...SHOP, storefront: { routes: { product: "/p/item" } } });
  assert.throws(broken, /storefront.routes.product must end with \{slug\}/u, "a product route without its slug is refused");
}

function renderPage(storefront, route) {
  const loader = storefront.pages(route);
  assert.ok(loader, `${route} is a storefront page`);
  return loader().then((Page) => renderToStaticMarkup(
      createElement(
        frontendReact.LocaleProvider,
        { locale: "cs" },
        createElement(frontendReact.RenderCurrentUrlProvider, { currentUrl: route }, createElement(Page)),
      ),
  ));
}

async function verifyPreset() {
  const storefront = react.eshopStorefront(SHOP, { slots: { checkout: { before: () => createElement("p", null, "Poznámka obchodu") } } });
  assert.deepEqual(
    [...storefront.paths].sort(),
    ["/", "/account", "/account/reset/_", "/cart", "/checkout", "/order/_", "/products/_"],
    "the build gets one page per storefront route",
  );
  assert.equal(storefront.pages("/blog"), undefined, "the app keeps its own pages");
  const cartHeading = /<h1[^>]*>(?:<span[^>]*>)?Košík(?:<\/span>)?<\/h1>/u;
  assert.match(await renderPage(storefront, "/cart"), cartHeading, "the cart page renders in the visitor's language");
  assert.match(await renderPage(storefront, "/checkout"), /Poznámka obchodu/u, "the app fills a page slot");
  assert.equal(storefront.href("order", "abc"), "/order/abc", "links are built from the routes");
}

verifyRoutes();
await verifyPreset();
log.info("verify.react", "e-shop react verification passed");
