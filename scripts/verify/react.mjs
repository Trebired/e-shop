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
log.info("verify.react", "e-shop react verification passed");
