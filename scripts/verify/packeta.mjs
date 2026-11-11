import assert from "node:assert/strict";
import crypto from "node:crypto";
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
const PASSWORD = "packeta-api-password";
const LABEL = Buffer.from("%PDF-1.4 verify label");

const CONFIG = {
  forVersion: "0.3.0",
  packeta: { apiKey: "public-widget-key", sender: "verify-shop" },
  payments: { bankTransfer: { accountName: "Verify s.r.o.", iban: "CZ6508000000192000145399" } },
  shipping: [{ id: "packeta", kind: "packeta", label: { cs: "Zásilkovna", en: "Packeta" }, priceMinor: 7900 }],
  shop: { locales: ["cs", "en"], name: "Verify Shop" },
};

function tag(xml, name) {
  return (xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "u")) ?? [])[1] ?? "";
}

async function fakePacketa(state) {
  return await listen(async(req, res) => {
      const body = await new Response(req).text();
      state.requests.push(body);
      res.setHeader("content-type", "text/xml");
      if (tag(body, "apiPassword") !== PASSWORD) {
        return res.end("<response><status>fault</status><fault>IncorrectApiPasswordFault</fault><string>Incorrect password</string></response>");
      }
      if (body.startsWith("<createPacket>")) {
        const id = String(4000000000 + ++state.seq);
        return res.end(`<response><status>ok</status><result><id>${id}</id><barcode>Z${id}</barcode></result></response>`);
      }
      if (body.startsWith("<packetLabelPdf>")) return res.end(`<response><status>ok</status><result>${LABEL.toString("base64")}</result></response>`);
      return res.end("<response><status>fault</status><fault>UnknownMethod</fault></response>");
  });
}

async function checkout(shop, variantId, pickupPoint) {
  const cart = await call(shop, "POST", "/eshop/api/cart/items", { quantity: 2, variantId });
  return await call(shop, "POST", "/eshop/api/checkout", {
      billingAddress: { city: "Brno", name: "Jana & Co Nováková", postalCode: "60200", street: "Česká 1" },
      contact: { email: "jana@example.test", name: "Jana & Co Nováková", phone: "+420777000111" },
      paymentMethod: "bank_transfer",
      pickupPoint,
      shippingMethodId: "packeta",
    }, cart.cookie);
}

function verifyConfig(server, config, pool) {
  const { packeta: _packeta, ...withoutPacketa } = CONFIG;
  const missing = /packeta\.apiKey and packeta\.sender are required/u;
  assert.throws(() => config.normalizeConfig(withoutPacketa), missing, "a packeta method needs the packeta config");
  const start = () => server.createEshop({ adminToken: TOKEN, config: CONFIG, pool });
  assert.throws(start, /e-shop-packeta-password-missing/u, "packet creation needs the API password");
}

async function verifyCheckout(shop, variantId) {
  const options = (await call(shop, "GET", "/eshop/api/checkout/options")).json;
  assert.deepEqual(options.packeta, { apiKey: "public-widget-key" }, "the storefront gets the public widget key");
  assert.equal(options.shipping[0].kind, "packeta", "the storefront knows the method needs a pickup point");
  assert.equal((await checkout(shop, variantId, null)).json.error, "eshop-pickup-point-required", "a Packeta order needs a pickup point");
  assert.equal((await checkout(shop, variantId, { id: "<x>", name: "Bad" })).status, 400, "a malformed pickup point is refused");
  const placed = (await checkout(shop, variantId, { id: "12345", name: "Brno, Česká 1" })).json.order;
  assert.deepEqual(placed.shipping.pickupPoint, { carrierId: "", id: "12345", name: "Brno, Česká 1" }, "the order keeps the pickup point");
  return placed;
}

async function verifyShipping(admin, state, placed) {
  await admin.action(placed.number, "mark-paid");
  const shipped = (await admin.action(placed.number, "ship")).order;
  const sent = state.requests.find((body) => body.startsWith("<createPacket>"));
  assert.equal(tag(sent, "addressId"), "12345", "the packet goes to the chosen pickup point");
  assert.equal(tag(sent, "eshop"), "verify-shop", "the packet carries the sender label");
  assert.equal(tag(sent, "number"), placed.number, "the packet carries the order number");
  assert.equal(tag(sent, "value"), (placed.totals.totalMinor / 100).toFixed(2), "the packet value is the order total in whole units");
  assert.equal(tag(sent, "weight"), "1.00", "the packet weight is the variant weight times the quantity in kilograms");
  assert.equal(tag(sent, "name"), "Jana &amp; Co", "names are escaped for XML");
  assert.equal(tag(sent, "surname"), "Nováková", "the last word of the name is the surname");
  assert.equal(shipped.tracking, shipped.shipping.packet.barcode, "shipping a Packeta order without a tracking number uses the packet barcode");
  const tracking = `https://tracking.packeta.com/Z${shipped.shipping.packet.id}`;
  assert.equal(shipped.shipping.packet.trackingUrl, tracking, "the order links to Packeta tracking");
  await admin.createPacket(placed.number);
  assert.equal(state.requests.filter((body) => body.startsWith("<createPacket>")).length, 1, "a packet is created once per order");
  assert.deepEqual(Buffer.from((await admin.packetLabel(placed.number)).pdf, "base64"), LABEL, "the label PDF comes from Packeta");
}

async function verifyCarrierPoint(shop, admin, state, variantId) {
  const placed = (await checkout(shop, variantId, { carrierId: "106", id: "CZ-BOX-77", name: "Z-BOX" })).json.order;
  await admin.createPacket(placed.number);
  const sent = state.requests.filter((body) => body.startsWith("<createPacket>")).at(-1);
  assert.equal(tag(sent, "addressId"), "106", "a carrier pickup point is addressed through its carrier");
  assert.equal(tag(sent, "carrierPickupPoint"), "CZ-BOX-77", "and names the point itself");
}

async function verifyPacketa() {
  if (!DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for verify:packeta");
  const server = await importDist("server");
  const config = await importDist("config");
  const client = await importDist("client");
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
  await resetDatabase(pool);
  verifyConfig(server, config, pool);
  const state = { requests: [], seq: 0 };
  const fake = await fakePacketa(state);
  const eshop = server.createEshop({ adminToken: TOKEN, config: CONFIG, packeta: { apiBase: fake.url, apiPassword: PASSWORD }, pool });
  await eshop.migrate();
  const shop = await listen((req, res) => eshop.handle(req, res));
  const admin = client.createEshopAdminClient({ baseUrl: shop.url, token: TOKEN });
  const product = (await admin.saveProduct({ name: { cs: "Hrnek", en: "Mug" }, slug: "hrnek", status: "active" })).product;
  const variant = (await admin.saveVariant(product.id, { priceMinor: 25000, sku: "MUG", stock: null, weightGrams: 500 })).variant;
  const placed = await verifyCheckout(shop.url, variant.id);
  await verifyShipping(admin, state, placed);
  await verifyCarrierPoint(shop.url, admin, state, variant.id);
  shop.server.close();
  fake.server.close();
  await resetDatabase(pool);
  await pool.end();
  log.info("verify.packeta", "e-shop Packeta verification passed");
}

await verifyPacketa();
