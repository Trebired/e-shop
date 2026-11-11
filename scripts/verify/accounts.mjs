import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { resolveLogger } from "@package/logger-adapter";
import { listen, resetDatabase, smtpSink } from "./shared.mjs";

const log = resolveLogger({ source: "@trebired/e-shop" });
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const importDist = async(subpath) => await import(pathToFileURL(path.join(rootDir, "dist", subpath, "index.js")).href);
const TOKEN = crypto.randomBytes(32).toString("hex");
const DATABASE_URL = process.env.TEST_DATABASE_URL;
const PASSWORD = "correct horse battery";

const CONFIG = {
  accounts: { resetPath: "/account/reset/{token}" },
  forVersion: "0.5.0",
  mail: { from: "shop@verify.test" },
  payments: { bankTransfer: { accountName: "Verify s.r.o.", iban: "CZ6508000000192000145399" } },
  shipping: [{ id: "pickup", kind: "pickup", label: { cs: "Osobní odběr", en: "Pickup" }, priceMinor: 0 }],
  shop: { locales: ["cs", "en"], name: "Verify Shop" },
};

function browser(base) {
  const jar = new Map();
  const request = async(method, pathName, body) => {
    const cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
    const response = await fetch(`${base}${pathName}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
        method,
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [key, ...rest] = pair.split("=");
      if (rest.join("=")) jar.set(key, rest.join("="));
      else jar.delete(key);
    }
    return { json: await response.json(), status: response.status };
  };
  return { jar, request };
}

async function verifySignup(shop) {
  const visitor = browser(shop);
  const weak = await visitor.request("POST", "/eshop/api/account/register", { email: "jana@example.test", name: "Jana", password: "short" });
  assert.equal(weak.json.error, "eshop-password-weak", "a short password is refused");
  const signup = { email: "Jana@Example.test", name: "Jana Nováková", password: PASSWORD };
  const made = await visitor.request("POST", "/eshop/api/account/register", signup);
  assert.equal(made.json.customer.email, "jana@example.test", "registering signs the customer in with a normalized email");
  assert.equal(visitor.jar.has("eshop_cart_session"), true, "the session lives in an HttpOnly cookie");
  const taken = await browser(shop).request("POST", "/eshop/api/account/register", { email: "jana@example.test", name: "Other", password: PASSWORD });
  assert.equal(taken.status, 409, "an email registers once");
  assert.equal((await browser(shop).request("GET", "/eshop/api/account")).json.customer, null, "a visitor without a session is nobody");
  return visitor;
}

async function verifyOrdersLink(shop, visitor, variantId, admin) {
  await visitor.request("POST", "/eshop/api/cart/items", { quantity: 1, variantId });
  assert.equal(visitor.jar.size, 2, "the cart cookie and the session cookie live side by side");
  const placed = (await visitor.request("POST", "/eshop/api/checkout", {
        billingAddress: { city: "Brno", name: "Jana Nováková", postalCode: "60200", street: "Česká 1" },
        contact: { email: "jana@example.test", name: "Jana Nováková", phone: "" },
        paymentMethod: "bank_transfer",
        shippingMethodId: "pickup",
  })).json.order;
  assert.ok(placed.customerId, "an order placed while signed in belongs to the account");
  const account = (await visitor.request("GET", "/eshop/api/account")).json;
  assert.deepEqual(account.orders.map((order) => order.number), [placed.number], "the account lists its orders");
  const listed = await admin.customers({ q: "nováková" });
  assert.equal(listed.items[0].orders, 1, "the admin API lists customers with their order count");
  assert.equal((await admin.customer(listed.items[0].id)).orders[0].number, placed.number, "and a customer's orders");
}

async function verifyLogin(shop) {
  const attacker = browser(shop);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const wrong = await attacker.request("POST", "/eshop/api/account/login", { email: "jana@example.test", password: "wrong password!" });
    assert.equal(wrong.status, 401, "a wrong password is refused");
  }
  const blocked = await attacker.request("POST", "/eshop/api/account/login", { email: "jana@example.test", password: PASSWORD });
  assert.equal(blocked.status, 429, "repeated failures are throttled, even before a correct password");
  const owner = browser(shop);
  await owner.request("POST", "/eshop/api/account/logout", {});
  return owner;
}

async function verifyReset(shop, messages, visitor) {
  const sentBefore = messages.length;
  const unknown = await browser(shop).request("POST", "/eshop/api/account/password/forgot", { email: "nobody@example.test" });
  assert.equal(unknown.status, 200, "an unknown email gets the same answer");
  assert.equal(messages.length, sentBefore, "and no email");
  await browser(shop).request("POST", "/eshop/api/account/password/forgot", { email: "jana@example.test" });
  const mail = messages.at(-1).replace(/=\r\n/gu, "");
  const token = mail.match(/\/account\/reset\/([A-Za-z0-9_-]{20,})/u)?.[1];
  assert.ok(token, "the reset email carries a reset link");
  const next = "a brand new passphrase";
  const reset = async() => (await browser(shop).request("POST", "/eshop/api/account/password/reset", { password: next, token })).status;
  assert.equal(await reset(), 200, "the link sets a new password");
  assert.equal(await reset(), 400, "the link works once");
  assert.equal((await visitor.request("GET", "/eshop/api/account")).json.customer, null, "a new password ends the old sessions");
  const fresh = browser(shop);
  const signedIn = await fresh.request("POST", "/eshop/api/account/login", { email: "jana@example.test", password: next });
  assert.equal(signedIn.status, 200, "the new password signs in");
  await fresh.request("POST", "/eshop/api/account/logout", {});
  assert.equal((await fresh.request("GET", "/eshop/api/account")).json.customer, null, "signing out ends the session");
}

async function verifyAccounts() {
  if (!DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for verify:accounts");
  const server = await importDist("server");
  const client = await importDist("client");
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
  await resetDatabase(pool);
  const messages = [];
  const smtp = await smtpSink(messages);
  let eshop = null;
  const shop = await listen((req, res) => eshop.handle(req, res));
  eshop = server.createEshop({ adminToken: TOKEN, config: CONFIG, pool, publicUrl: shop.url, smtpUrl: `smtp://127.0.0.1:${smtp.port}` });
  await eshop.migrate();
  const admin = client.createEshopAdminClient({ baseUrl: shop.url, token: TOKEN });
  const product = (await admin.saveProduct({ name: { cs: "Hrnek", en: "Mug" }, slug: "hrnek", status: "active" })).product;
  const variant = (await admin.saveVariant(product.id, { priceMinor: 25000, sku: "MUG", stock: null })).variant;
  const visitor = await verifySignup(shop.url);
  await verifyOrdersLink(shop.url, visitor, variant.id, admin);
  await verifyLogin(shop.url);
  await verifyReset(shop.url, messages, visitor);
  const closed = server.createEshop({ adminToken: TOKEN, config: { ...CONFIG, accounts: undefined }, pool });
  const plain = await listen((req, res) => closed.handle(req, res));
  assert.equal((await fetch(`${plain.url}/eshop/api/account`)).status, 404, "without accounts in the config the routes do not exist");
  plain.server.close();
  shop.server.close();
  smtp.server.close();
  await resetDatabase(pool);
  await pool.end();
  log.info("verify.accounts", "e-shop account verification passed");
}

await verifyAccounts();
