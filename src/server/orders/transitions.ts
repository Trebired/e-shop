import type { Order } from "./../../types.js";
import type { Db } from "./../db/database.js";
import { conflict } from "./../errors.js";
import { text } from "./../input.js";
import { readOrder, recordEvent } from "./read.js";
import { ORDER_ACTIONS, ORDER_MOVES, type OrderAction } from "./../../orders.js";

const STAMPS: Record<OrderAction, string|null> = {
  cancel: "cancelled_at",
  deliver: "delivered_at",
  "mark-paid": "paid_at",
  process: null,
  refund: null,
  ship: "shipped_at",
};

async function restock(db: Db, orderId: string): Promise<void> {
  await db.exec(
    `update eshop_variants v set stock = v.stock + l.quantity from eshop_order_lines l
    where l.order_id = $1 and l.variant_id = v.id and v.stock is not null`,
    [orderId],
  );
}

async function moveOrder(db: Db, number: string, action: OrderAction, input: any, actor: string): Promise<Order> {
  const move = ORDER_MOVES[action];
  const stampColumn = STAMPS[action];
  await db.tx(async(tx) => {
      const row = await tx.one("select id, status, payment from eshop_orders where number = $1 for update", [String(number)]);
      if (!row) throw conflict("eshop-order-not-found");
      if (!move.from.includes(row.status)) throw conflict("eshop-order-status-invalid", { status: row.status });
      const stamp = stampColumn ? `, ${stampColumn} = now()` : "";
      const tracking = action === "ship" ? text(input?.tracking, "tracking", 200) : null;
      const gatewayPaid = row.payment?.status === "paid" && row.payment?.method !== "bank_transfer";
      const paymentStatus = action === "cancel" && gatewayPaid ? "refunded" : { "mark-paid": "paid", refund: "refunded" }[action as string];
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
