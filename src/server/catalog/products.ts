import type { Product, ProductImage, ProductStatus, Variant } from "./../../types.js";
import type { Db } from "./../db/database.js";
import { badRequest, conflict, notFound } from "./../errors.js";
import { localizedText, oneOf, slug, text, uuid } from "./../input.js";

const STATUSES: ProductStatus[] = ["draft", "active", "archived"];
const MAX_IMAGES = 20;
const UNIQUE_VIOLATION = "23505";

type ProductQuery = { activeOnly?: boolean; limit?: number; offset?: number; q?: string; status?: ProductStatus };

function toVariant(row: any): Variant {
  return {
    active: row.active,
    id: row.id,
    name: row.name,
    position: row.position,
    priceMinor: row.price_minor,
    productId: row.product_id,
    sku: row.sku,
    stock: row.stock,
    weightGrams: row.weight_grams,
  };
}

function toProduct(row: any, variants: Variant[]): Product {
  return {
    categoryId: row.category_id,
    createdAt: new Date(row.created_at).toISOString(),
    description: row.description,
    id: row.id,
    images: row.images,
    name: row.name,
    slug: row.slug,
    status: row.status,
    updatedAt: new Date(row.updated_at).toISOString(),
    variants,
    vatRate: row.vat_rate,
  };
}

async function withVariants(db: Db, rows: any[], activeOnly: boolean): Promise<Product[]> {
  if (!rows.length) return [];
  const variants = await db.many(
    `select * from eshop_variants where product_id = any($1::uuid[]) and ($2::boolean = false or active) order by position, sku`,
    [rows.map((row) => row.id), activeOnly],
  );
  return rows.map((row) => toProduct(row, variants.filter((variant) => variant.product_id === row.id).map(toVariant)));
}

async function listProducts(db: Db, query: ProductQuery = {}): Promise<{items:Product[];total:number}> {
  const status = query.activeOnly ? "active" : query.status ?? null;
  const search = query.q ? `%${query.q.toLowerCase()}%` : null;
  const where = "($1::text is null or status = $1) and ($2::text is null or lower(name::text) like $2 or slug like $2)";
  const rows = await db.many(`select * from eshop_products where ${where} order by updated_at desc limit $3 offset $4`, [
      status,
      search,
      Math.min(Math.max(query.limit ?? 50, 1), 200),
      Math.max(query.offset ?? 0, 0),
  ]);
  const total = await db.one<{count:number}>(`select count(*)::int as count from eshop_products where ${where}`, [status, search]);
  return { items: await withVariants(db, rows, Boolean(query.activeOnly)), total: total?.count ?? 0 };
}

async function getProduct(db: Db, ref: { id?: string; slug?: string }, activeOnly = false): Promise<Product> {
  const row = ref.id
  ? await db.one("select * from eshop_products where id = $1", [uuid(ref.id, "id")])
  : await db.one("select * from eshop_products where slug = $1", [String(ref.slug ?? "")]);
  if (!row || (activeOnly && row.status !== "active")) throw notFound("eshop-product-not-found");
  return (await withVariants(db, [row], activeOnly))[0] as Product;
}

function images(value: unknown): ProductImage[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_IMAGES) throw badRequest("eshop-too-many-images");
  return value.map((image) => ({ alt: text(image?.alt, "alt", 300), src: text(image?.src, "src", 2000) })).filter((image) => image.src);
}

function productValues(input: any, defaultVat: number): unknown[] {
  return [
    slug(input.slug),
    JSON.stringify(localizedText(input.name, "name", 200)),
    JSON.stringify(input.description ? localizedText(input.description, "description", 20000) : {}),
    oneOf(input.status ?? "draft", STATUSES, "status"),
    input.categoryId ? uuid(input.categoryId, "categoryId") : null,
    JSON.stringify(images(input.images)),
    Number(input.vatRate ?? defaultVat),
  ];
}

async function saveProduct(db: Db, input: any, options: { defaultVat: number; id?: string }): Promise<Product> {
  const values = productValues(input, options.defaultVat);
  try {
    const row = options.id
    ? await db.one(
      `update eshop_products set slug = $2, name = $3, description = $4, status = $5, category_id = $6, images = $7, vat_rate = $8,
      updated_at = now() where id = $1 returning *`,
      [uuid(options.id, "id"), ...values],
    )
    : await db.one(
      `insert into eshop_products (slug, name, description, status, category_id, images, vat_rate) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      values,
    );
    if (!row) throw notFound("eshop-product-not-found");
    return (await withVariants(db, [row], false))[0] as Product;
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw conflict("eshop-slug-taken");
    throw error;
  }
}

async function deleteProduct(db: Db, id: string): Promise<void> {
  if (!(await db.exec("delete from eshop_products where id = $1", [uuid(id, "id")]))) throw notFound("eshop-product-not-found");
}

export { deleteProduct, getProduct, listProducts, saveProduct, toVariant };
export type { ProductQuery };
