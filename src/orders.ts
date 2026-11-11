import type { OrderStatus } from "./types.js";

type OrderAction = "cancel" | "deliver" | "mark-paid" | "process" | "refund" | "ship";

const ORDER_MOVES: Readonly<Record<OrderAction, {readonly from:readonly OrderStatus[];readonly to:OrderStatus}>> = {
  cancel: { from: ["pending_payment", "paid", "processing"], to: "cancelled" },
  deliver: { from: ["shipped"], to: "delivered" },
  "mark-paid": { from: ["pending_payment"], to: "paid" },
  process: { from: ["paid"], to: "processing" },
  refund: { from: ["paid", "processing", "shipped", "delivered"], to: "refunded" },
  ship: { from: ["paid", "processing"], to: "shipped" },
};

const ORDER_ACTIONS = Object.keys(ORDER_MOVES) as OrderAction[];

function orderActionsFor(status: OrderStatus): OrderAction[] {
  return ORDER_ACTIONS.filter((action) => ORDER_MOVES[action].from.includes(status));
}

export { ORDER_ACTIONS, ORDER_MOVES, orderActionsFor };
export type { OrderAction };
