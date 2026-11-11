import type { Order, OrderStatus } from "./../../types.js";
import type { Db } from "./../db/database.js";
import { conflict } from "./../errors.js";
import { text } from "./../input.js";
import { readOrder, recordEvent } from "./read.js";

type OrderAction = "cancel" | "deliver" | "mark-paid" | "process" | "refund" | "ship";

const MOVES: Record<OrderAction, {from:OrderStatus[];stamp:string|null;to:OrderStatus}> = {
  cancel: { from: ["pending_payment", "paid", "processing"], stamp: "cancelled_at", to: "cancelled" },
  deliver: { from: ["shipped"], stamp: "delivered_at", to: "delivered" },
  "mark-paid": { from: ["pending_payment"], stamp: "paid_at", to: "paid" },
  process: { from: ["paid"], stamp: null, to: "processing" },
  refund: { from: ["paid", "processing", "shipped", "delivered"], stamp: null, to: "refunded" },
  ship: { from: ["paid", "processing"], stamp: "shipped_at", to: "shipped" },
};

const ORDER_ACTIONS = Object.keys(MOVES) as OrderAction[];

async function restock(db: Db, orderId: string): Promise<void> {
  await db.exec(
    `update eshop_variants v set stock = v.stock + l.quantity from eshop_order_lines l
    where l.order_id = $1 and l.variant_id = v.id and v.stock is not null`,
    [orderId],
  );
}

async function moveOrder(db: Db, number: string, action: OrderAction, input: any, actor: string): Promise<Order> {
  const move = MOVES[action];
  await db.tx(async(tx) => {
      const row = await tx.one("select id, status, payment from eshop_orders where number = $1 for update", [String(number)]);
      if (!row) throw conflict("eshop-order-not-found");
      if (!move.from.includes(row.status)) throw conflict("eshop-order-status-invalid", { status: row.status });
      const stamp = move.stamp ? `, ${move.stamp} = now()` : "";
      const tracking = action === "ship" ? text(input?.tracking, "tracking", 200) : null;
      const paymentStatus = { "mark-paid": "paid", refund: "refunded" }[action as string];
      const payment = paymentStatus ? { ...row.payment, status: paymentStatus } : row.payment;
      await tx.exec(`update eshop_orders set status = $2, payment = $3, tracking = coalesce($4, tracking)${stamp} where id = $1`, [
          row.id,
          move.to,
          JSON.stringify(payment),
          tracking,
      ]);
      if (action === "cancel" && row.status !== "shipped") await restock(tx, row.id);
      await recordEvent(tx, row.id, { actor, data: { from: row.status, note: text(input?.note, "note", 1000), to: move.to }, kind: action });
  });
  return await readOrder(db, { number });
}

export { moveOrder, ORDER_ACTIONS };
export type { OrderAction };
