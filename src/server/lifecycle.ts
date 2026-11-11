import type { Order } from "./../types.js";
import type { EshopContext } from "./context.js";
import { customerMail, operatorMail, type MailKind } from "./mail.js";
import { orderEvent, postEvent } from "./notify.js";

const MAIL_FOR: Record<string, MailKind> = { cancel: "cancelled", created: "confirmation", "mark-paid": "paid", ship: "shipped" };

function statusUrl(context: EshopContext, order: Order): string {
  if (!context.publicUrl) return "";
  return `${context.publicUrl.replace(/\/+$/u, "")}${context.config.orders.statusPath.replace("{token}", order.token)}`;
}

async function afterOrderChange(context: EshopContext, order: Order, change: string): Promise<void> {
  const kind = MAIL_FOR[change];
  const work: Promise<unknown>[] = [postEvent(context.eventsUrl, context.adminToken, orderEvent(`order.${change}`, order))];
  if (kind) work.push(context.mailer.send(customerMail(context.config, order, kind, statusUrl(context, order))));
  if (change === "created" && context.config.mail.operator) work.push(context.mailer.send(operatorMail(context.config, order)));
  await Promise.allSettled(work);
}

export { afterOrderChange, statusUrl };
