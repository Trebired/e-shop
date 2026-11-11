import type { Order, OrderEvent, OrderStatus } from "./../../types.js";
import type { Db } from "./../db/database.js";
import { notFound } from "./../errors.js";

type OrderQuery = { limit?: number; offset?: number; q?: string; status?: OrderStatus };

function iso(value: unknown): string | null {
  return value ? new Date(value as string).toISOString() : null;
}

function toOrder(row: any, lines: any[]): Order {
  return {
    billingAddress: row.billing_address,
    cancelledAt: iso(row.cancelled_at),
    contact: row.contact,
    createdAt: iso(row.created_at) as string,
    currency: row.currency,
    customerId: row.customer_id ?? null,
    deliveredAt: iso(row.delivered_at),
    id: row.id,
    lines: lines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          sku: line.sku,
          totalMinor: line.total_minor,
          unitPriceMinor: line.unit_price_minor,
          variantId: line.variant_id,
          variantName: line.variant_name,
          vatRate: line.vat_rate,
    })),
    locale: row.locale,
    note: row.note,
    number: row.number,
    paidAt: iso(row.paid_at),
    payment: row.payment,
    shippedAt: iso(row.shipped_at),
    shipping: row.shipping,
    shippingAddress: row.shipping_address,
    status: row.status,
    token: row.token,
    totals: row.totals,
    tracking: row.tracking,
  };
}

async function readOrder(db: Db, ref: { number?: string; token?: string }): Promise<Order> {
  const row = ref.number
  ? await db.one("select * from eshop_orders where number = $1", [String(ref.number)])
  : await db.one("select * from eshop_orders where token = $1", [String(ref.token ?? "")]);
  if (!row) throw notFound("eshop-order-not-found");
  const lines = await db.many("select * from eshop_order_lines where order_id = $1 order by position", [row.id]);
  return toOrder(row, lines);
}

async function listOrders(db: Db, query: OrderQuery = {}): Promise<{items:Order[];total:number}> {
  const search = query.q ? `%${query.q.toLowerCase()}%` : null;
  const where = "($1::text is null or status = $1) and ($2::text is null or number like $2 or lower(contact::text) like $2)";
  const rows = await db.many(`select * from eshop_orders where ${where} order by created_at desc limit $3 offset $4`, [
      query.status ?? null,
      search,
      Math.min(Math.max(query.limit ?? 50, 1), 200),
      Math.max(query.offset ?? 0, 0),
  ]);
  const lines = rows.length
  ? await db.many("select * from eshop_order_lines where order_id = any($1::uuid[]) order by position", [rows.map((row) => row.id)])
  : [];
  const total = await db.one<{count:number}>(`select count(*)::int as count from eshop_orders where ${where}`, [query.status ?? null, search]);
  return { items: rows.map((row) => toOrder(row, lines.filter((line) => line.order_id === row.id))), total: total?.count ?? 0 };
}

async function orderEvents(db: Db, orderId: string): Promise<OrderEvent[]> {
  const rows = await db.many("select * from eshop_order_events where order_id = $1 order by id", [orderId]);
  return rows.map((row) => ({ actor: row.actor, createdAt: new Date(row.created_at).toISOString(), data: row.data, kind: row.kind }));
}

async function recordEvent(db: Db, orderId: string, event: { actor: string; data?: Record<string, unknown>; kind: string }): Promise<void> {
  await db.exec("insert into eshop_order_events (order_id, kind, actor, data) values ($1, $2, $3, $4)", [
      orderId,
      event.kind,
      event.actor,
      JSON.stringify(event.data ?? {}),
  ]);
}

export { listOrders, orderEvents, readOrder, recordEvent, toOrder };
export type { OrderQuery };
