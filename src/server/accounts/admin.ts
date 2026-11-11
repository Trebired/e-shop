import type { Customer, Order } from "./../../types.js";
import type { Db } from "./../db/database.js";
import { notFound } from "./../errors.js";
import { uuid } from "./../input.js";
import { readOrder } from "./../orders/read.js";
import { toCustomer } from "./store.js";

const MAX_LIMIT = 200;

async function listCustomers(db: Db, query: { limit?: number; offset?: number; q?: string }): Promise<{items:Customer[];total:number}> {
  const search = query.q ? `%${query.q.toLowerCase()}%` : null;
  const where = "($1::text is null or c.email like $1 or lower(c.name) like $1)";
  const rows = await db.many(
    `select c.*, (select count(*) from eshop_orders o where o.customer_id = c.id)::int as orders from eshop_customers c
    where ${where} order by c.created_at desc limit $2 offset $3`,
    [search, Math.min(Math.max(Number(query.limit) || 50, 1), MAX_LIMIT), Math.max(Number(query.offset) || 0, 0)],
  );
  const total = await db.one<{count:number}>(`select count(*)::int as count from eshop_customers c where ${where}`, [search]);
  return { items: rows.map((row) => ({ ...toCustomer(row), orders: row.orders })), total: total?.count ?? 0 };
}

async function readCustomer(db: Db, id: string): Promise<{customer:Customer;orders:Order[]}> {
  const row = await db.one("select * from eshop_customers where id = $1", [uuid(id, "id")]);
  if (!row) throw notFound("eshop-customer-not-found");
  const numbers = await db.many<{number:string}>("select number from eshop_orders where customer_id = $1 order by created_at desc", [row.id]);
  return { customer: toCustomer(row), orders: await Promise.all(numbers.map(async(item) => await readOrder(db, { number: item.number }))) };
}

export { listCustomers, readCustomer };
