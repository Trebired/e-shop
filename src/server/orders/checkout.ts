import crypto from "node:crypto";
import type { NormalizedEshopConfig } from "./../../config/types.js";
import { vatLines } from "./../../money.js";
import type { Address, Cart, Contact, Order, OrderPayment, OrderShipping } from "./../../types.js";
import { clearCart, readCart } from "./../cart.js";
import type { Db } from "./../db/database.js";
import { badRequest, conflict } from "./../errors.js";
import { oneOf, text } from "./../input.js";
import { availablePaymentMethods, bankTransferInstructions } from "./../payments.js";
import { chooseShipping } from "./../shipping.js";
import { readOrder, recordEvent } from "./read.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function contactOf(input: any): Contact {
  const email = text(input?.email, "contact.email", 254).toLowerCase();
  if (!EMAIL.test(email)) throw badRequest("eshop-email-invalid");
  const name = text(input?.name, "contact.name", 200);
  if (!name) throw badRequest("eshop-name-required");
  return { email, name, phone: text(input?.phone, "contact.phone", 40) };
}

function addressOf(input: any, field: string): Address {
  const address = {
    city: text(input?.city, `${field}.city`, 120),
    country: text(input?.country || "CZ", `${field}.country`, 2).toUpperCase(),
    name: text(input?.name, `${field}.name`, 200),
    postalCode: text(input?.postalCode, `${field}.postalCode`, 20),
    street: text(input?.street, `${field}.street`, 200),
  };
  if (!address.name || !address.street || !address.city || !address.postalCode) throw badRequest("eshop-address-incomplete", { field });
  return address;
}

async function nextOrderNumber(db: Db): Promise<string> {
  const year = new Date().getUTCFullYear();
  const row = await db.one<{value:number}>(
    "insert into eshop_counters (key, value) values ($1, 1) on conflict (key) do update set value = eshop_counters.value + 1 returning value",
    [`orders:${year}`],
  );
  return `${year}${String(row?.value ?? 1).padStart(6, "0")}`;
}

async function takeStock(db: Db, cart: Cart): Promise<void> {
  for (const line of cart.lines) {
    const taken = await db.exec("update eshop_variants set stock = stock - $2 where id = $1 and (stock is null or stock >= $2)", [
        line.variantId,
        line.quantity,
    ]);
    if (!taken) throw conflict("eshop-out-of-stock", { sku: line.sku });
  }
}

function totalsOf(config: NormalizedEshopConfig, cart: Cart, shipping: OrderShipping) {
  const amounts = cart.lines.map((line) => ({ grossMinor: line.totalMinor, rate: line.vatRate }));
  if (shipping.priceMinor) amounts.push({ grossMinor: shipping.priceMinor, rate: config.vat.defaultRate });
  const totalMinor = cart.subtotalMinor + shipping.priceMinor;
  return { shippingMinor: shipping.priceMinor, subtotalMinor: cart.subtotalMinor, totalMinor, vat: vatLines(amounts) };
}

async function paymentFor(config: NormalizedEshopConfig, method: string, order: { number: string; totalMinor: number }): Promise<OrderPayment> {
  const kind = oneOf(method, availablePaymentMethods(config), "paymentMethod");
  const instructions = kind === "bank_transfer" ? await bankTransferInstructions(config, order) : null;
  return { instructions, method: kind, redirectUrl: "", reference: "", status: "pending" };
}

async function insertOrder(db: Db, values: any): Promise<string> {
  const row = await db.one<{id:string}>(
    `insert into eshop_orders (number, token, status, currency, locale, contact, billing_address, shipping_address, shipping, payment, totals,
    total_minor, note, customer_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
    [
      values.number, values.token, "pending_payment", values.currency, values.locale, JSON.stringify(values.contact),
      JSON.stringify(values.billing), JSON.stringify(values.shippingAddress), JSON.stringify(values.shipping),
      JSON.stringify(values.payment), JSON.stringify(values.totals), values.totals.totalMinor, values.note, values.customerId,
    ],
  );
  return row?.id as string;
}

async function insertLines(db: Db, orderId: string, cart: Cart): Promise<void> {
  for (const [position, line] of cart.lines.entries()) {
    await db.exec(
      `insert into eshop_order_lines (order_id, variant_id, sku, name, variant_name, unit_price_minor, quantity, vat_rate, total_minor, position)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [orderId, line.variantId, line.sku, JSON.stringify(line.productName), JSON.stringify(line.variantName), line.unitPriceMinor, line.quantity,
        line.vatRate, line.totalMinor, position],
    );
  }
}

async function placeOrder(db: Db, config: NormalizedEshopConfig, cartToken: string, input: any, customerId: string | null = null): Promise<Order> {
  const contact = contactOf(input?.contact);
  const billing = addressOf(input?.billingAddress, "billingAddress");
  const shippingAddress = input?.shippingAddress ? addressOf(input.shippingAddress, "shippingAddress") : billing;
  const locale = config.shop.locales.includes(input?.locale) ? input.locale : config.shop.defaultLocale;
  const number = await db.tx(async(tx) => {
      const cart = await readCart(tx, cartToken, config.shop.currency);
      if (!cart.lines.length) throw badRequest("eshop-cart-empty");
      const shipping = chooseShipping(config, input, cart.subtotalMinor);
      await takeStock(tx, cart);
      const totals = totalsOf(config, cart, shipping);
      const orderNumber = await nextOrderNumber(tx);
      const payment = await paymentFor(config, input?.paymentMethod, { number: orderNumber, totalMinor: totals.totalMinor });
      const token = crypto.randomBytes(24).toString("base64url");
      const values = { billing, contact, currency: cart.currency, locale, note: text(
          input?.note,
          "note",
          2000
        ), customerId, number: orderNumber, payment, shipping, shippingAddress, token, totals };
      const orderId = await insertOrder(tx, values);
      await insertLines(tx, orderId, cart);
      await recordEvent(tx, orderId, { actor: "customer", kind: "created" });
      await clearCart(tx, cartToken);
      return orderNumber;
  });
  return await readOrder(db, { number });
}

export { placeOrder };
