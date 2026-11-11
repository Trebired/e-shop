import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { resolveLogger } from "@package/logger-adapter";
import { call, listen, resetDatabase, smtpSink } from "./shared.mjs";

const log = resolveLogger({ source: "@trebired/e-shop" });
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const importDist = async(subpath) => await import(pathToFileURL(path.join(rootDir, "dist", subpath, "index.js")).href);
const TOKEN = crypto.randomBytes(32).toString("hex");
const DATABASE_URL = process.env.TEST_DATABASE_URL;
const YEAR = new Date().getUTCFullYear();

const SUPPLIER = {
  city: "Brno",
  companyId: "12345678",
  country: "Česká republika",
  name: "Verify s.r.o.",
  postalCode: "602 00",
  registration: "Zapsáno v obchodním rejstříku vedeném Krajským soudem v Brně",
  street: "Údolní 1",
  vatId: "CZ12345678",
  vatPayer: true,
};

const CONFIG = {
  forVersion: "0.5.0",
  invoices: { supplier: SUPPLIER },
  mail: { from: "shop@verify.test" },
  payments: { bankTransfer: { accountName: "Verify s.r.o.", iban: "CZ6508000000192000145399" } },
  shipping: [{ id: "courier", kind: "courier", label: { cs: "Kurýr", en: "Courier" }, priceMinor: 12100 }],
  shop: { locales: ["cs", "en"], name: "Verify Shop" },
  vat: { defaultRate: 21 },
};

async function placeOrder(shop, variantId) {
  const cart = await call(shop, "POST", "/eshop/api/cart/items", { quantity: 2, variantId });
  return (await call(shop, "POST", "/eshop/api/checkout", {
        billingAddress: { city: "Praha", name: "Jana Nováková", postalCode: "11000", street: "Žitná 2" },
        contact: { email: "jana@example.test", name: "Jana Nováková", phone: "" },
        locale: "cs",
        paymentMethod: "bank_transfer",
        shippingMethodId: "courier",
      }, cart.cookie)).json.order;
}

function verifyConfig(config) {
  const { vatId: _vatId, ...noVatId } = SUPPLIER;
  const normalize = () => config.normalizeConfig({ ...CONFIG, invoices: { supplier: noVatId } });
  assert.throws(normalize, /vatId is required for a VAT payer/u, "a VAT payer needs a VAT id");
}

async function verifyInvoice(admin, placed) {
  await admin.action(placed.number, "mark-paid");
  const detail = await admin.order(placed.number);
  assert.equal(detail.invoices.length, 1, "paying an order issues its invoice");
  const summary = detail.invoices[0];
  assert.equal(summary.number, `${YEAR}000001`, "invoice numbers count per year");
  const { invoice, pdf } = await admin.invoice(summary.number);
  assert.equal(invoice.totalMinor, placed.totals.totalMinor, "the invoice total is the order total");
  assert.deepEqual(invoice.vat, placed.totals.vat, "the invoice lists VAT per rate");
  const lines = invoice.lines.map((line) => [line.name, line.quantity, line.vatRate]);
  assert.deepEqual(lines, [["Hrnek Modrý", 2, 12], ["Kurýr", 1, 21]], "lines and shipping keep their VAT rates");
  assert.equal(invoice.supplier.vatId, "CZ12345678", "the supplier is frozen into the invoice");
  assert.deepEqual(invoice.customer.address, ["Žitná 2", "11000 Praha", "CZ"], "the customer is the billing address");
  const bytes = Buffer.from(pdf, "base64");
  assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-", "the invoice renders as a PDF");
  assert.match(bytes.toString("latin1"), /\/BaseFont \/[A-Z]{6}\+NotoSans-Bold/u, "the PDF embeds a subset of the shipped font");
  return invoice;
}

async function verifyStorefrontAccess(shop, placed, other) {
  const listed = (await call(shop, "GET", `/eshop/api/orders/${placed.token}`)).json.invoices;
  assert.equal(listed.length, 1, "the customer sees the invoice on the order page");
  const response = await fetch(`${shop}/eshop/api/orders/${placed.token}/invoices/${listed[0].number}`);
  assert.equal(response.headers.get("content-type"), "application/pdf", "the customer downloads the invoice PDF");
  const foreign = await fetch(`${shop}/eshop/api/orders/${other.token}/invoices/${listed[0].number}`);
  assert.equal(foreign.status, 404, "another order's token cannot fetch it");
}

async function verifyCreditNote(admin, placed, invoice) {
  await admin.action(placed.number, "refund");
  const notes = (await admin.order(placed.number)).invoices.filter((item) => item.kind === "credit_note");
  assert.equal(notes.length, 1, "a refund issues a credit note");
  const note = (await admin.invoice(notes[0].number)).invoice;
  assert.equal(note.number, `D${YEAR}000001`, "credit notes have their own series");
  assert.equal(note.originalNumber, invoice.number, "the credit note names the invoice it corrects");
  assert.equal(note.totalMinor, -invoice.totalMinor, "the credit note reverses the total");
}

async function verifyInvoices() {
  if (!DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for verify:invoices");
  const server = await importDist("server");
  const client = await importDist("client");
  verifyConfig(await importDist("config"));
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 8 });
  await resetDatabase(pool);
  const messages = [];
  const smtp = await smtpSink(messages);
  const eshop = server.createEshop({ adminToken: TOKEN, config: CONFIG, pool, smtpUrl: `smtp://127.0.0.1:${smtp.port}` });
  await eshop.migrate();
  const shop = await listen((req, res) => eshop.handle(req, res));
  const admin = client.createEshopAdminClient({ baseUrl: shop.url, token: TOKEN });
  const product = (await admin.saveProduct({ name: { cs: "Hrnek", en: "Mug" }, slug: "hrnek", status: "active", vatRate: 12 })).product;
  const variant = (await admin.saveVariant(product.id, { name: { cs: "Modrý", en: "Blue" }, priceMinor: 25000, sku: "MUG", stock: null })).variant;
  const placed = await placeOrder(shop.url, variant.id);
  const other = await placeOrder(shop.url, variant.id);
  const invoice = await verifyInvoice(admin, placed);
  const paidMail = messages.find((message) => message.includes(`${invoice.number}.pdf`));
  assert.ok(paidMail && /Content-Type: application\/pdf/iu.test(paidMail), "the paid email carries the invoice PDF");
  await verifyStorefrontAccess(shop.url, placed, other);
  await verifyCreditNote(admin, placed, invoice);
  await admin.action(other.number, "cancel");
  assert.equal((await admin.order(other.number)).invoices.length, 0, "cancelling an unpaid order issues nothing");
  shop.server.close();
  smtp.server.close();
  await resetDatabase(pool);
  await pool.end();
  log.info("verify.invoices", "e-shop invoice verification passed");
}

await verifyInvoices();
