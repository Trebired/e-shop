import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { resolveLogger } from "@package/logger-adapter";
import { call, listen, resetDatabase } from "./shared.mjs";

const log = resolveLogger({ source: "@trebired/e-shop" });
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const importDist = async(subpath) => await import(pathToFileURL(path.join(rootDir, "dist", subpath, "index.js")).href);
const TOKEN = crypto.randomBytes(32).toString("hex");
const DATABASE_URL = process.env.TEST_DATABASE_URL;

const CONFIG = {
  forVersion: "0.6.0",
  payments: { bankTransfer: { accountName: "Verify s.r.o.", iban: "CZ6508000000192000145399" } },
  shipping: [
    { id: "pickup", kind: "pickup", label: { cs: "Osobní odběr", en: "Pickup" }, priceMinor: 0 },
    { freeFromMinor: 300000, id: "courier", kind: "courier", label: { cs: "Kurýr", en: "Courier" }, priceMinor: 12900 },
  ],
  shop: { locales: ["cs", "en"], name: "Verify Shop" },
};

async function verifyAdminAuth(url, server) {
  assert.equal((await call(url, "GET", "/eshop/admin/api/v1/info")).status, 401, "an unsigned admin call is refused");
  const ts = Date.now();
  const path = "/eshop/admin/api/v1/info";
  const signature = server.signRequest(TOKEN, { body: "", method: "GET", path, timestamp: ts });
  const headers = { "x-eshop-signature": signature, "x-eshop-timestamp": String(ts) };
  assert.equal((await fetch(`${url}${path}`, { headers })).status, 200, "a signed call passes");
  assert.equal((await fetch(`${url}${path}`, { headers })).status, 401, "the same signature twice is a replay");
  const old = Date.now() - 10 * 60 * 1000;
  const stale = { "x-eshop-signature": server.signRequest(
      TOKEN,
      { body: "", method: "GET", path, timestamp: old }
    ), "x-eshop-timestamp": String(old) };
  assert.equal((await fetch(`${url}${path}`, { headers: stale })).status, 401, "an expired timestamp is refused");
  const wrong = { "x-eshop-signature": server.signRequest(
      "x".repeat(64),
      { body: "", method: "GET", path, timestamp: Date.now() }
    ), "x-eshop-timestamp": String(Date.now()) };
  assert.equal((await fetch(`${url}${path}`, { headers: wrong })).status, 401, "a signature from another token is refused");
}

async function seedCatalog(admin) {
  const draft = (await admin.saveProduct({ name: { cs: "Skica", en: "Draft" }, slug: "draft-item", status: "draft" })).product;
  await admin.saveVariant(draft.id, { priceMinor: 1000, sku: "DRAFT-1" });
  const mug = (await admin.saveProduct({ name: { cs: "Hrnek", en: "Mug" }, slug: "hrnek", status: "active", vatRate: 21 })).product;
  const last = (await admin.saveVariant(mug.id, { name: { cs: "Modrý", en: "Blue" }, priceMinor: 25000, sku: "MUG-BLUE", stock: 1 })).variant;
  const plenty = (await admin.saveVariant(mug.id, { name: { cs: "Bílý", en: "White" }, priceMinor: 30000, sku: "MUG-WHITE", stock: null })).variant;
  return { last, plenty };
}

const checkoutBody = (shippingMethodId = "courier") => ({
    billingAddress: { city: "Brno", name: "Jana Nováková", postalCode: "60200", street: "Česká 1" },
    contact: { email: "jana@example.test", name: "Jana Nováková", phone: "" },
    paymentMethod: "bank_transfer",
    shippingMethodId,
});

async function verifyStorefront(url, variants) {
  const catalog = await call(url, "GET", "/eshop/api/catalog");
  assert.deepEqual(catalog.json.items.map((item) => item.slug), ["hrnek"], "a draft product never reaches the storefront");
  const first = await call(url, "POST", "/eshop/api/cart/items", { quantity: 2, variantId: variants.last.id });
  assert.equal(first.status, 409, "more than the stock is refused");
  const added = await call(url, "POST", "/eshop/api/cart/items", { quantity: 3, variantId: variants.plenty.id }, first.cookie);
  assert.equal(added.json.cart.subtotalMinor, 90000, "the cart totals its lines");
  const order = (await call(url, "POST", "/eshop/api/checkout", checkoutBody(), added.cookie)).json.order;
  assert.equal(order.totals.shippingMinor, 12900, "shipping is charged below the free threshold");
  assert.equal(order.totals.totalMinor, 102900, "the total adds shipping");
  assert.equal(order.totals.vat[0].rate, 21, "VAT is split by rate");
  assert.equal(order.totals.vat[0].vatMinor, Math.round((102900 * 21) / 121), "VAT is the share of the gross price");
  assert.match(order.payment.instructions.qrSvg, /<svg/u, "a bank transfer carries a QR code");
  assert.equal((await call(url, "GET", "/eshop/api/cart", undefined, added.cookie)).json.cart.lines.length, 0, "checkout empties the cart");
  return order;
}

async function verifyStockRace(url, variants) {
  const buyers = await Promise.all([0, 1].map(async() => {
        const cart = await call(url, "POST", "/eshop/api/cart/items", { quantity: 1, variantId: variants.last.id });
        return cart.cookie;
  }));
  const results = await Promise.all(buyers.map((cookie) => call(url, "POST", "/eshop/api/checkout", checkoutBody("pickup"), cookie)));
  assert.deepEqual(results.map((res) => res.status).sort(), [200, 409], "two buyers racing for the last item: exactly one gets it");
  return results.find((res) => res.status === 200).json.order;
}

async function verifyTransitions(admin, order, raceOrder) {
  const root = await import(pathToFileURL(path.join(rootDir, "dist", "index.js")).href);
  assert.deepEqual(root.orderActionsFor("pending_payment"), ["cancel", "mark-paid"], "an unpaid order can be paid or cancelled");
  assert.deepEqual(root.orderActionsFor("delivered"), ["refund"], "a delivered order can only be refunded");
  await assert.rejects(admin.action(order.number, "ship"), /eshop-order-status-invalid/u, "an unpaid order cannot ship");
  await admin.action(order.number, "mark-paid");
  const shipped = (await admin.action(order.number, "ship", { tracking: "Z123" })).order;
  assert.equal(shipped.tracking, "Z123", "shipping keeps the tracking number");
  assert.equal((await admin.action(order.number, "deliver")).order.status, "delivered", "a shipped order can be delivered");
  await admin.action(raceOrder.number, "cancel");
  const product = (await admin.products({ q: "hrnek" })).items[0];
  assert.equal(product.variants.find((variant) => variant.sku === "MUG-BLUE").stock, 1, "cancelling returns the stock");
  assert.equal((await admin.product("hrnek")).product.id, product.id, "the admin API finds a product by its slug");
  assert.equal((await admin.product(product.id)).product.slug, "hrnek", "the admin API finds a product by its id");
  const detail = await admin.order(order.number);
  assert.deepEqual(detail.events.map((event) => event.kind), ["created", "mark-paid", "ship", "deliver"], "every change is in the order history");
  const stats = await admin.stats();
  assert.equal(stats.revenueMinor, 102900, "revenue counts paid orders only");
  assert.equal(stats.paidOrders, 1, "the cancelled order is not counted as paid");
}

function verifySpayd(server) {
  const text = server.spaydString({ amountMinor: 102900, currency: "CZK", iban: "CZ6508000000192000145399", message: "Obchod * žluťoučký", variableSymbol: "2026000001" });
  assert.equal(
    text,
    "SPD*1.0*ACC:CZ6508000000192000145399*AM:1029.00*CC:CZK*X-VS:2026000001*MSG:Obchod   zlutoucky",
    "the QR payment string follows SPAYD"
  );
}

async function verifyEvents(server, pool) {
  const received = [];
  const receiver = await listen(async(req, res) => {
      const body = await new Response(req).text();
      received.push(server.verifySignature(TOKEN, { body, method: "POST", path: "/events", signature: req.headers["x-eshop-signature"], timestamp: req.headers["x-eshop-timestamp"] }));
      res.end("{}");
  });
  const eshop = server.createEshop({ adminToken: TOKEN, config: CONFIG, eventsUrl: `${receiver.url}/events`, pool });
  const shop = await listen((req, res) => eshop.handle(req, res));
  const cart = await call(
    shop.url,
    "POST",
    "/eshop/api/cart/items",
    { quantity: 1, variantId: (await pool.query("select id from eshop_variants where sku = 'MUG-WHITE'")).rows[0].id }
  );
  await call(shop.url, "POST", "/eshop/api/checkout", checkoutBody("pickup"), cart.cookie);
  assert.deepEqual(received, [true], "a new order is reported to the events URL with a valid signature");
  shop.server.close();
  receiver.server.close();
}

async function verifyStorefrontPages(server, pool) {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "eshop-pages-"));
  fs.mkdirSync(path.join(dist, "products", "_"), { recursive: true });
  fs.writeFileSync(path.join(dist, "products", "_", "index.html"), "<html>product shell</html>");
  const eshop = server.createEshop({ adminToken: TOKEN, config: { ...CONFIG, storefront: {} }, pool, storefrontDir: dist });
  const shop = await listen((req, res) => eshop.handle(req, res));
  const product = await fetch(`${shop.url}/products/hrnek`);
  assert.equal(await product.text(), "<html>product shell</html>", "a product address is served the built product page");
  assert.equal((await fetch(`${shop.url}/products/a/b`)).status, 404, "an address outside the storefront routes is left to the app");
  assert.equal((await fetch(`${shop.url}/cart`)).status, 404, "a storefront page that was not built is left to the app");
  shop.server.close();
  fs.rmSync(dist, { force: true, recursive: true });
}

async function verifyServer() {
  if (!DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for verify:server");
  const server = await importDist("server");
  const client = await importDist("client");
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
  await resetDatabase(pool);
  const eshop = server.createEshop({ adminToken: TOKEN, config: CONFIG, pool });
  const migrations = ["eshop_001_core", "eshop_002_payment_reference", "eshop_003_invoices", "eshop_004_accounts"];
  assert.deepEqual(await eshop.migrate(), migrations, "the first run applies the schema");
  assert.deepEqual(await eshop.migrate(), [], "a second run applies nothing");
  const { server: http0, url } = await listen((req, res) => eshop.handle(req, res));
  await verifyAdminAuth(url, server);
  const admin = client.createEshopAdminClient({ baseUrl: url, token: TOKEN });
  const variants = await seedCatalog(admin);
  const order = await verifyStorefront(url, variants);
  assert.match(order.number, /^\d{4}000001$/u, "order numbers count per year");
  const raceOrder = await verifyStockRace(url, variants);
  await verifyTransitions(admin, order, raceOrder);
  verifySpayd(server);
  await verifyEvents(server, pool);
  await verifyStorefrontPages(server, pool);
  http0.close();
  await resetDatabase(pool);
  await pool.end();
  log.info("verify.server", "e-shop server verification passed");
}

await verifyServer();
