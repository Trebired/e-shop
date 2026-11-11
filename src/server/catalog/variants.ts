import type { Variant } from "./../../types.js";
import type { Db } from "./../db/database.js";
import { conflict, notFound } from "./../errors.js";
import { localizedText, optionalStock, sku, uuid, wholeNumber } from "./../input.js";
import { toVariant } from "./products.js";

const UNIQUE_VIOLATION = "23505";

function variantValues(input: any): unknown[] {
  return [
    sku(input.sku),
    JSON.stringify(input.name ? localizedText(input.name, "name", 200) : {}),
    wholeNumber(input.priceMinor, "priceMinor", 0, 1_000_000_000_00),
    optionalStock(input.stock),
    wholeNumber(input.weightGrams ?? 0, "weightGrams", 0, 1_000_000),
    input.active !== false,
    wholeNumber(input.position ?? 0, "position", 0, 100000),
  ];
}

async function saveVariant(db: Db, productId: string, input: any, id?: string): Promise<Variant> {
  try {
    const row = id
    ? await db.one(
      `update eshop_variants set sku = $3, name = $4, price_minor = $5, stock = $6, weight_grams = $7, active = $8, position = $9
      where id = $1 and product_id = $2 returning *`,
      [uuid(id, "id"), uuid(productId, "productId"), ...variantValues(input)],
    )
    : await db.one(
      `insert into eshop_variants (product_id, sku, name, price_minor, stock, weight_grams, active, position)
      values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [uuid(productId, "productId"), ...variantValues(input)],
    );
    if (!row) throw notFound("eshop-variant-not-found");
    await db.exec("update eshop_products set updated_at = now() where id = $1", [productId]);
    return toVariant(row);
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw conflict("eshop-sku-taken");
    throw error;
  }
}

async function setStock(db: Db, variantId: string, stock: unknown): Promise<Variant> {
  const row = await db.one("update eshop_variants set stock = $2 where id = $1 returning *", [uuid(variantId, "variantId"), optionalStock(stock)]);
  if (!row) throw notFound("eshop-variant-not-found");
  return toVariant(row);
}

async function deleteVariant(db: Db, productId: string, id: string): Promise<void> {
  const removed = await db.exec("delete from eshop_variants where id = $1 and product_id = $2", [uuid(id, "id"), uuid(productId, "productId")]);
  if (!removed) throw notFound("eshop-variant-not-found");
}

export { deleteVariant, saveVariant, setStock };
