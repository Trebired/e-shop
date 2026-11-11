import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { resolveLogger } from "@package/logger-adapter";
import { listen, resetDatabase } from "./shared.mjs";

const log = resolveLogger({ source: "@trebired/e-shop" });
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const importDist = async(subpath) => await import(pathToFileURL(path.join(rootDir, "dist", subpath, "index.js")).href);
const TOKEN = crypto.randomBytes(32).toString("hex");
const DATABASE_URL = process.env.TEST_DATABASE_URL;
const STRIPE = { secretKey: "sk_test_verify", webhookSecret: "whsec_verify" };
const GOPAY = { clientId: "verify-client", clientSecret: "verify-secret" };
const COMGATE = { secret: "comgate-secret" };
const MERCHANT = "123456";

const CONFIG = {
  forVersion: "0.5.0",
  payments: {
    bankTransfer: { accountName: "Verify s.r.o.", iban: "CZ6508000000192000145399" },
    comgate: { merchant: MERCHANT, test: true },
    gopay: { goid: "8123456789", sandbox: true },
    stripe: { enabled: true },
  },
  shipping: [{ id: "pickup", kind: "pickup", label: { cs: "Osobní odběr", en: "Pickup" }, priceMinor: 0 }],
  shop: { locales: ["cs", "en"], name: "Verify Shop" },
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function fakeStripe(state, req, url, body, res) {
  if (req.headers.authorization !== `Bearer ${STRIPE.secretKey}`) return json(res, 401, {});
  if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const id = `cs_${++state.seq}`;
    const amount = Number(body.get("line_items[0][price_data][unit_amount]"));
    state.stripe[id] = { amount, id, payment_intent: `pi_${state.seq}`, payment_status: "unpaid", status: "open" };
    return json(res, 200, { ...state.stripe[id], url: `https://pay.test/stripe/${id}` });
  }
  const session = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/u);
  if (session) return json(res, 200, state.stripe[session[1]] ?? {});
  if (url.pathname === "/v1/refunds") {
    state.refunds.push({ amount: Number(body.get("amount")), gateway: "stripe", reference: body.get("payment_intent") });
    return json(res, 200, { id: "re_1" });
  }
  return json(res, 404, {});
}

function fakeGopay(state, req, url, body, res) {
  if (url.pathname === "/oauth2/token") {
    const expected = `Basic ${Buffer.from(`${GOPAY.clientId}:${GOPAY.clientSecret}`).toString("base64")}`;
    return req.headers.authorization === expected ? json(res, 200, { access_token: "gopay-token", expires_in: 1800 }) : json(res, 401, {});
  }
  if (req.headers.authorization !== "Bearer gopay-token") return json(res, 401, {});
  if (url.pathname === "/payments/payment") {
    const id = 3000000000 + ++state.seq;
    state.gopay[id] = { amount: body.amount, goid: body.target.goid, state: "CREATED" };
    return json(res, 200, { gw_url: `https://pay.test/gopay/${id}`, id, state: "CREATED" });
  }
  const refund = url.pathname.match(/^\/payments\/payment\/(\d+)\/refund$/u);
  if (refund) {
    state.refunds.push({ amount: Number(body.get("amount")), gateway: "gopay", reference: refund[1] });
    return json(res, 200, { id: Number(refund[1]), result: "FINISHED" });
  }
  const status = url.pathname.match(/^\/payments\/payment\/(\d+)$/u);
  return status ? json(res, 200, { id: Number(status[1]), state: state.gopay[status[1]]?.state }) : json(res, 404, {});
}

function fakeComgate(state, req, url, body, res) {
  if (req.headers.authorization !== `Basic ${Buffer.from(`${MERCHANT}:${COMGATE.secret}`).toString("base64")}`) return json(res, 401, {});
  if (url.pathname === "/v2.0/payment.json") {
    const transId = `AB12-CD34-${String(++state.seq).padStart(4, "0")}`;
    state.comgate[transId] = { body, status: "PENDING" };
    return json(res, 200, { code: 0, message: "OK", redirect: `https://pay.test/comgate/${transId}`, transId });
  }
  if (url.pathname === "/v2.0/refund.json") {
    state.refunds.push({ amount: body.amount, gateway: "comgate", reference: body.transId });
    return json(res, 200, { code: 0, message: "OK" });
  }
  const status = url.pathname.match(/^\/v2\.0\/payment\/transId\/(.+)\.json$/u);
  return status ? json(res, 200, { code: 0, message: "OK", status: state.comgate[status[1]]?.status }) : json(res, 404, {});
}

async function fakeGateways(state) {
  return await listen(async(req, res) => {
      const raw = await new Response(req).text();
      const url = new URL(req.url, "http://local");
      const form = String(req.headers["content-type"] ?? "").includes("form");
      const body = form ? new URLSearchParams(raw) : raw ? JSON.parse(raw) : {};
      const [, kind] = url.pathname.split("/");
      url.pathname = url.pathname.slice(kind.length + 1);
      const handler = { comgate: fakeComgate, gopay: fakeGopay, stripe: fakeStripe }[kind];
      return handler ? handler(state, req, url, body, res) : json(res, 404, {});
  });
}

async function call(url, method, pathName, body, headers = {}) {
  const response = await fetch(`${url}${pathName}`, {
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      headers: { ...(body === undefined || typeof body === "string" ? {} : { "content-type": "application/json" }), ...headers },
      method,
      redirect: "manual",
  });
  const text = await response.text();
  return {
    cookie: (response.headers.get("set-cookie") ?? "").split(";")[0],
    json: text ? JSON.parse(text) : null,
    location: response.headers.get("location"),
    status: response.status,
  };
}

async function order(shop, variantId, paymentMethod) {
  const cart = await call(shop, "POST", "/eshop/api/cart/items", { quantity: 1, variantId });
  const body = {
    billingAddress: { city: "Brno", name: "Jana Nováková", postalCode: "60200", street: "Česká 1" },
    contact: { email: "jana@example.test", name: "Jana Nováková", phone: "" },
    paymentMethod,
    shippingMethodId: "pickup",
  };
  return (await call(shop, "POST", "/eshop/api/checkout", body, { cookie: cart.cookie })).json.order;
}

function stripeSignature(body, secret = STRIPE.webhookSecret, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

async function verifyStripe(shop, admin, state, variantId) {
  const placed = await order(shop, variantId, "stripe");
  assert.match(placed.payment.redirectUrl, /^https:\/\/pay\.test\/stripe\/cs_/u, "a card order sends the customer to Stripe");
  assert.equal(state.stripe[placed.payment.reference].amount, placed.totals.totalMinor, "Stripe is asked for the order total");
  const event = JSON.stringify({ data: { object: { id: placed.payment.reference } }, id: "evt_1", type: "checkout.session.completed" });
  const forged = await call(shop, "POST", "/eshop/api/payments/stripe/notify", event, { "stripe-signature": stripeSignature(event, "whsec_other") });
  assert.equal(forged.status, 401, "a webhook signed with another secret is refused");
  const staleSignature = stripeSignature(event, STRIPE.webhookSecret, 1);
  const stale = await call(shop, "POST", "/eshop/api/payments/stripe/notify", event, { "stripe-signature": staleSignature });
  assert.equal(stale.status, 401, "an old webhook signature is refused");
  state.stripe[placed.payment.reference].payment_status = "paid";
  for (let round = 0; round < 2; round += 1) {
    const sent = await call(shop, "POST", "/eshop/api/payments/stripe/notify", event, { "stripe-signature": stripeSignature(event) });
    assert.equal(sent.status, 200, "a signed webhook is accepted");
  }
  const detail = await admin.order(placed.number);
  assert.equal(detail.order.status, "paid", "the webhook marks the order paid");
  assert.equal(detail.events.filter((item) => item.kind === "mark-paid").length, 1, "a repeated webhook is applied once");
  await admin.action(placed.number, "refund");
  const intent = `pi_${placed.payment.reference.slice(3)}`;
  const refund = { amount: placed.totals.totalMinor, gateway: "stripe", reference: intent };
  assert.deepEqual(state.refunds.at(-1), refund, "a refund goes back through Stripe");
  assert.equal((await admin.order(placed.number)).order.payment.status, "refunded", "the payment is marked refunded");
}

async function verifyGopay(shop, admin, state, variantId) {
  const placed = await order(shop, variantId, "gopay");
  assert.match(placed.payment.redirectUrl, /^https:\/\/pay\.test\/gopay\//u, "a GoPay order sends the customer to GoPay");
  assert.equal(state.gopay[placed.payment.reference].goid, 8123456789, "the payment goes to the configured GoPay shop");
  state.gopay[placed.payment.reference].state = "CANCELED";
  const back = await call(shop, "GET", `/eshop/api/payments/gopay/return?id=${placed.payment.reference}`);
  assert.equal(back.status, 303, "the customer returning from GoPay is sent on");
  assert.equal(back.location, `${shop}/order/${placed.token}`, "to the order status page");
  assert.equal((await admin.order(placed.number)).order.payment.status, "failed", "a cancelled payment is marked failed");
  const again = (await call(shop, "POST", `/eshop/api/orders/${placed.token}/pay`, {})).json.order;
  assert.notEqual(again.payment.reference, placed.payment.reference, "paying again starts a new payment");
  state.gopay[again.payment.reference].state = "PAID";
  const notified = await call(shop, "GET", `/eshop/api/payments/gopay/notify?id=${again.payment.reference}`);
  assert.equal(notified.status, 200, "a GoPay notification is accepted");
  assert.equal((await admin.order(placed.number)).order.status, "paid", "the notification is checked with GoPay and marks the order paid");
}

async function verifyComgate(shop, admin, state, variantId) {
  const placed = await order(shop, variantId, "comgate");
  const sent = state.comgate[placed.payment.reference].body;
  assert.equal(sent.price, placed.totals.totalMinor, "Comgate is asked for the order total in minor units");
  const returnPattern = /\/eshop\/api\/payments\/comgate\/return\?id=\$\{id\}&refId=\$\{refId\}$/u;
  assert.match(sent.url_paid, returnPattern, "Comgate gets the return address");
  const push = (secret) => JSON.stringify({ merchant: MERCHANT, refId: placed.number, secret, status: "PAID", transId: placed.payment.reference });
  const headers = { "content-type": "application/json" };
  const notify = async(secret) => await call(shop, "POST", "/eshop/api/payments/comgate/notify", push(secret), headers);
  assert.equal((await notify("wrong")).status, 401, "a push with a wrong secret is refused");
  await notify(COMGATE.secret);
  assert.equal((await admin.order(placed.number)).order.status, "pending_payment", "a push is checked against the payment status first");
  state.comgate[placed.payment.reference].status = "PAID";
  assert.equal((await notify(COMGATE.secret)).status, 200, "a valid push is accepted");
  assert.equal((await admin.order(placed.number)).order.status, "paid", "the confirmed push marks the order paid");
  await admin.action(placed.number, "cancel");
  const refund = { amount: placed.totals.totalMinor, gateway: "comgate", reference: placed.payment.reference };
  assert.deepEqual(state.refunds.at(-1), refund, "cancelling a paid order refunds it");
  assert.equal((await admin.order(placed.number)).order.payment.status, "refunded", "the cancelled card payment is marked refunded");
}

function verifyMissingSecrets(server, pool) {
  const start = () => server.createEshop({ adminToken: TOKEN, config: CONFIG, pool });
  assert.throws(start, /e-shop-gateway-secrets-missing/u, "an enabled gateway without credentials stops the start");
}

async function verifyGateways() {
  if (!DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for verify:gateways");
  const server = await importDist("server");
  const client = await importDist("client");
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
  await resetDatabase(pool);
  verifyMissingSecrets(server, pool);
  const state = { comgate: {}, gopay: {}, refunds: [], seq: 0, stripe: {} };
  const fake = await fakeGateways(state);
  let eshop = null;
  const shop = await listen((req, res) => eshop.handle(req, res));
  eshop = server.createEshop({
      adminToken: TOKEN,
      config: CONFIG,
      gateways: {
        comgate: { ...COMGATE, apiBase: `${fake.url}/comgate` },
        gopay: { ...GOPAY, apiBase: `${fake.url}/gopay` },
        stripe: { ...STRIPE, apiBase: `${fake.url}/stripe` },
      },
      pool,
      publicUrl: shop.url,
  });
  await eshop.migrate();
  const admin = client.createEshopAdminClient({ baseUrl: shop.url, token: TOKEN });
  const product = (await admin.saveProduct({ name: { cs: "Hrnek", en: "Mug" }, slug: "hrnek", status: "active" })).product;
  const variant = (await admin.saveVariant(product.id, { priceMinor: 25000, sku: "MUG", stock: null })).variant;
  const offered = (await call(shop.url, "GET", "/eshop/api/checkout/options")).json.payments;
  assert.deepEqual(offered, ["bank_transfer", "stripe", "gopay", "comgate"], "every configured method is offered");
  await verifyStripe(shop.url, admin, state, variant.id);
  await verifyGopay(shop.url, admin, state, variant.id);
  await verifyComgate(shop.url, admin, state, variant.id);
  shop.server.close();
  fake.server.close();
  await resetDatabase(pool);
  await pool.end();
  log.info("verify.gateways", "e-shop gateway verification passed");
}

await verifyGateways();
