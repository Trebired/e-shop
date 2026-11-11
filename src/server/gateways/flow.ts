import type { Order } from "./../../types.js";
import type { EshopContext } from "./../context.js";
import { EshopError, badRequest } from "./../errors.js";
import { afterOrderChange, statusUrl } from "./../lifecycle.js";
import { readOrder } from "./../orders/read.js";
import { moveOrder } from "./../orders/transitions.js";
import { ORDER_MOVES, type OrderAction } from "./../../orders.js";
import type { Gateway, GatewayKind, GatewayState } from "./types.js";

const GATEWAY_ACTOR = "gateway";

function gatewayOf(context: EshopContext, order: Order): Gateway | null {
  return context.gateways[order.payment.method as GatewayKind] ?? null;
}

function callbackUrl(context: EshopContext, kind: string, action: "notify" | "return"): string {
  return `${context.publicUrl.replace(/\/+$/u, "")}${context.config.basePath}/api/payments/${kind}/${action}`;
}

async function savePayment(context: EshopContext, order: Order, patch: Partial<Order["payment"]>): Promise<Order> {
  await context.db.exec("update eshop_orders set payment = payment || $2::jsonb where id = $1", [order.id, JSON.stringify(patch)]);
  return await readOrder(context.db, { number: order.number });
}

async function startPayment(context: EshopContext, order: Order): Promise<Order> {
  const gateway = gatewayOf(context, order);
  if (!gateway || order.status !== "pending_payment") throw badRequest("eshop-payment-unavailable");
  if (!context.publicUrl) throw new EshopError(500, "eshop-public-url-missing");
  const started = await gateway.start(
    {
      currency: order.currency,
      email: order.contact.email,
      locale: order.locale,
      name: order.contact.name,
      number: order.number,
      title: `${context.config.shop.name} ${order.number}`,
      totalMinor: order.totals.totalMinor,
    },
    {
      cancelUrl: statusUrl(context, order),
      notifyUrl: callbackUrl(context, gateway.kind, "notify"),
      returnUrl: callbackUrl(context, gateway.kind, "return"),
    },
  );
  return await savePayment(context, order, { redirectUrl: started.redirectUrl, reference: started.reference, status: "pending" });
}

async function settle(context: EshopContext, order: Order, state: GatewayState): Promise<Order> {
  if (state === "paid" && order.status === "pending_payment") {
    try {
      const paid = await moveOrder(context.db, order.number, "mark-paid", {}, GATEWAY_ACTOR);
      await afterOrderChange(context, paid, "mark-paid");
      return paid;
    } catch (error) {
      if (error instanceof EshopError && error.code === "eshop-order-status-invalid") return await readOrder(context.db, { number: order.number });
      throw error;
    }
  }
  const waiting = order.status === "pending_payment" && order.payment.status === "pending";
  if (state === "failed" && waiting) return await savePayment(context, order, { status: "failed" });
  return order;
}

async function refreshPayment(context: EshopContext, order: Order): Promise<Order> {
  const gateway = gatewayOf(context, order);
  if (!gateway || !order.payment.reference || order.status !== "pending_payment") return order;
  return await settle(context, order, await gateway.status(order.payment.reference));
}

async function orderByReference(context: EshopContext, kind: string, reference: string): Promise<Order|null> {
  const row = await context.db.one<{number:string}>(
    "select number from eshop_orders where payment->>'method' = $1 and payment->>'reference' = $2",
    [kind, reference],
  );
  return row ? await readOrder(context.db, { number: row.number }) : null;
}

async function refundThroughGateway(context: EshopContext, number: string, action: OrderAction): Promise<void> {
  if (action !== "refund" && action !== "cancel") return;
  const order = await readOrder(context.db, { number });
  const gateway = gatewayOf(context, order);
  if (!gateway || order.payment.status !== "paid" || !order.payment.reference) return;
  if (!ORDER_MOVES[action].from.includes(order.status)) return;
  await gateway.refund(order.payment.reference, order.totals.totalMinor);
}

export { orderByReference, refreshPayment, refundThroughGateway, settle, startPayment };
