import type { Db } from "./db/database.js";

const PAID_STATUSES = ["paid", "processing", "shipped", "delivered"];
const LOW_STOCK = 5;
const DAY_MS = 86400000;
const MAX_RANGE_DAYS = 366;

type StatsRange = { from: Date; to: Date };

function rangeOf(input: { from?: unknown; to?: unknown }): StatsRange {
  const to = input.to ? new Date(String(input.to)) : new Date();
  const from = input.from ? new Date(String(input.from)) : new Date(to.getTime() - 30 * DAY_MS);
  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime()) || from >=to) return { from: new Date(Date.now() - 30 * DAY_MS), to: new Date() };
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) return { from: new Date(to.getTime() - MAX_RANGE_DAYS * DAY_MS), to };
  return { from, to };
}

async function eshopStats(db: Db, input: { from?: unknown; to?: unknown }) {
  const range = rangeOf(input);
  const params = [range.from, range.to, PAID_STATUSES];
  const summary = await db.one(
    `select coalesce(sum(total_minor) filter (where status = any($3::text[])), 0) as revenue_minor,
    count(*) filter (where status = any($3::text[]))::int as paid_orders, count(*)::int as orders,
    count(*) filter (where status = 'pending_payment')::int as awaiting_payment
    from eshop_orders where created_at >= $1 and created_at < $2`,
    params,
  );
  const days = await db.many(
    `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as orders,
    coalesce(sum(total_minor) filter (where status = any($3::text[])), 0) as revenue_minor
    from eshop_orders where created_at >= $1 and created_at < $2 group by 1 order by 1`,
    params,
  );
  const top = await db.many(
    `select l.sku, l.name, sum(l.quantity)::int as quantity, sum(l.total_minor) as revenue_minor from eshop_order_lines l
    join eshop_orders o on o.id = l.order_id where o.created_at >= $1 and o.created_at < $2 and o.status = any($3::text[])
    group by l.sku, l.name order by 3 desc limit 10`,
    params,
  );
  const lowStock = await db.many(
    `select v.id, v.sku, v.stock, p.name from eshop_variants v join eshop_products p on p.id = v.product_id
    where v.stock is not null and v.stock <= $1 and v.active and p.status = 'active' order by v.stock, v.sku limit 50`,
    [LOW_STOCK],
  );
  const paid = Number(summary?.paid_orders ?? 0);
  return {
    averageOrderMinor: paid ? Math.round(Number(summary?.revenue_minor ?? 0) / paid) : 0,
    awaitingPayment: Number(summary?.awaiting_payment ?? 0),
    days: days.map((row) => ({ day: row.day, orders: row.orders, revenueMinor: row.revenue_minor })),
    from: range.from.toISOString(),
    lowStock: lowStock.map((row) => ({ id: row.id, name: row.name, sku: row.sku, stock: row.stock })),
    orders: Number(summary?.orders ?? 0),
    paidOrders: paid,
    revenueMinor: Number(summary?.revenue_minor ?? 0),
    to: range.to.toISOString(),
    topProducts: top.map((row) => ({ name: row.name, quantity: row.quantity, revenueMinor: row.revenue_minor, sku: row.sku })),
  };
}

export { eshopStats };
