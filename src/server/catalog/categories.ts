import type { Category } from "./../../types.js";
import type { Db } from "./../db/database.js";
import { notFound } from "./../errors.js";
import { localizedText, slug, uuid, wholeNumber } from "./../input.js";

function toCategory(row: any): Category {
  return { id: row.id, name: row.name, parentId: row.parent_id, position: row.position, slug: row.slug };
}

async function listCategories(db: Db): Promise<Category[]> {
  return (await db.many("select * from eshop_categories order by position, slug")).map(toCategory);
}

async function saveCategory(db: Db, input: any, id?: string): Promise<Category> {
  const values = [
    slug(input.slug),
    JSON.stringify(localizedText(input.name, "name", 120)),
    input.parentId ? uuid(input.parentId, "parentId") : null,
    wholeNumber(input.position ?? 0, "position", 0, 100000),
  ];
  const row = id
  ? await db.one("update eshop_categories set slug = $2, name = $3, parent_id = $4, position = $5 where id = $1 returning *", [
      uuid(id, "id"),
      ...values
  ])
  : await db.one("insert into eshop_categories (slug, name, parent_id, position) values ($1, $2, $3, $4) returning *", values);
  if (!row) throw notFound("eshop-category-not-found");
  return toCategory(row);
}

async function deleteCategory(db: Db, id: string): Promise<void> {
  if (!(await db.exec("delete from eshop_categories where id = $1", [uuid(id, "id")]))) throw notFound("eshop-category-not-found");
}

export { deleteCategory, listCategories, saveCategory };
