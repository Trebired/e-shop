import type { Order } from "./../types.js";
import type { EshopContext } from "./context.js";
import { issueInvoice } from "./invoices/issue.js";
import { invoicePdf } from "./invoices/pdf.js";
import { customerMail, operatorMail, type MailAttachment, type MailKind } from "./mail.js";
import { orderEvent, postEvent } from "./notify.js";

const MAIL_FOR: Record<string, MailKind> = { cancel: "cancelled", created: "confirmation", "mark-paid": "paid", ship: "shipped" };

function statusUrl(context: EshopContext, order: Order): string {
  if (!context.publicUrl) return "";
  return `${context.publicUrl.replace(/\/+$/u, "")}${context.config.orders.statusPath.replace("{token}", order.token)}`;
}

async function invoiceAttachments(context: EshopContext, order: Order, change: string): Promise<MailAttachment[]> {
  const kind = change === "mark-paid" ? "invoice" : change === "refund" || change === "cancel" ? "credit_note" : null;
  if (!kind || !context.config.invoices) return [];
  const invoice = await issueInvoice(context.db, context.config, order, kind);
  if (!invoice) return [];
  return [{ content: await invoicePdf(invoice), contentType: "application/pdf", filename: `${invoice.number}.pdf` }];
}

async function afterOrderChange(context: EshopContext, order: Order, change: string): Promise<void> {
  const kind = MAIL_FOR[change];
  const attachments = await invoiceAttachments(context, order, change);
  const work: Promise<unknown>[] = [postEvent(context.eventsUrl, context.adminToken, orderEvent(`order.${change}`, order))];
  if (kind) work.push(context.mailer.send({ ...customerMail(context.config, order, kind, statusUrl(context, order)), attachments }));
  if (change === "created" && context.config.mail.operator) work.push(context.mailer.send(operatorMail(context.config, order)));
  await Promise.allSettled(work);
}

export { afterOrderChange, statusUrl };
