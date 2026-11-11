import crypto from "node:crypto";
import type { Cart, CartLine } from "./../types.js";
import type { Db } from "./db/database.js";
import { badRequest, conflict } from "./errors.js";
import { uuid, wholeNumber } from "./input.js";

const TOKEN = /^[A-Za-z0-9_-]{32,64}$/u;
const MAX_QUANTITY = 999;
const MAX_LINES = 100;

function newCartToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function validToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

async function ensureCart(db: Db, token: unknown): Promise<string> {
  if (validToken(token) && (await db.one("select token from eshop_carts where token = $1", [token]))) return token;
  const created = newCartToken();
  await db.exec("insert into eshop_carts (token) values ($1)", [created]);
  return created;
}

function toLine(row: any): CartLine {
  const images = Array.isArray(row.images) ? row.images : [];
  return {
    image: images[0] ?? null,
    productName: row.product_name,
    productSlug: row.slug,
    quantity: row.quantity,
    sku: row.sku,
    totalMinor: row.price_minor * row.quantity,
    unitPriceMinor: row.price_minor,
    variantId: row.variant_id,
    variantName: row.variant_name,
    vatRate: row.vat_rate,
  };
}

async function readCart(db: Db, token: string, currency: string): Promise<Cart> {
  const rows = validToken(token)
  ? await db.many(
    `select i.variant_id, i.quantity, v.sku, v.name as variant_name, v.price_minor, p.name as product_name, p.slug, p.images, p.vat_rate
    from eshop_cart_items i join eshop_variants v on v.id = i.variant_id join eshop_products p on p.id = v.product_id
    where i.cart_token = $1 and v.active and p.status = $2 order by p.slug, v.position`,
    [token, "active"],
  )
  : [];
  const lines = rows.map(toLine);
  return { currency, lines, subtotalMinor: lines.reduce((sum, line) => sum + line.totalMinor, 0) };
}

async function setCartItem(db: Db, token: string, input: any): Promise<void> {
  const variantId = uuid(input.variantId, "variantId");
  const quantity = wholeNumber(input.quantity, "quantity", 0, MAX_QUANTITY);
  if (!quantity) {
    await db.exec("delete from eshop_cart_items where cart_token = $1 and variant_id = $2", [token, variantId]);
    return;
  }
  const variant = await db.one(
    `select v.stock from eshop_variants v join eshop_products p on p.id = v.product_id where v.id = $1 and v.active and p.status = $2`,
    [variantId, "active"],
  );
  if (!variant) throw badRequest("eshop-variant-unavailable");
  if (variant.stock !== null && quantity > variant.stock) throw conflict("eshop-out-of-stock", { available: variant.stock });
  const lines = await db.one<{count:number}>("select count(*)::int as count from eshop_cart_items where cart_token = $1", [token]);
  if ((lines?.count ?? 0) >= MAX_LINES) throw badRequest("eshop-cart-full");
  await db.exec(
    `insert into eshop_cart_items (cart_token, variant_id, quantity) values ($1, $2, $3)
    on conflict (cart_token, variant_id) do update set quantity = excluded.quantity`,
    [token, variantId, quantity],
  );
  await db.exec("update eshop_carts set updated_at = now() where token = $1", [token]);
}

async function clearCart(db: Db, token: string): Promise<void> {
  await db.exec("delete from eshop_cart_items where cart_token = $1", [token]);
}

async function pruneCarts(db: Db, ttlDays: number): Promise<number> {
  return await db.exec("delete from eshop_carts where updated_at < now() - make_interval(days => $1::int)", [ttlDays]);
}

export { clearCart, ensureCart, pruneCarts, readCart, setCartItem, validToken };
