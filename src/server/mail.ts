import nodemailer from "nodemailer";
import type { NormalizedEshopConfig } from "./../config/types.js";
import { formatMoney, localized } from "./../money.js";
import type { Order } from "./../types.js";
import { fill, mailCopy } from "./messages.js";

type MailAttachment = { content: Buffer; contentType: string; filename: string };
type MailMessage = { attachments?: MailAttachment[]; subject: string; text: string; to: string };
type Mailer = { send: (message: MailMessage) => Promise<boolean> };
type MailKind = "cancelled" | "confirmation" | "paid" | "shipped";

function createMailer(smtpUrl: string, from: string): Mailer {
  if (!smtpUrl || !from) return { send: async() => false };
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    send: async(message) => {
      try {
        await transport.sendMail({ attachments: message.attachments, from, subject: message.subject, text: message.text, to: message.to });
        return true;
      } catch {
        return false;
      }
    },
  };
}

function orderLines(order: Order): string[] {
  const money = (minor: number) => formatMoney(minor, order.currency, order.locale);
  const copy = mailCopy(order.locale);
  const lines = order.lines.map((line) =>
    fill(copy.item, {
        name: `${localized(line.name, order.locale)} ${localized(line.variantName, order.locale)}`.trim(),
        quantity: line.quantity,
        total: money(line.totalMinor),
    }),
  );
  lines.push(fill(copy.shipping, { label: localized(order.shipping.label, order.locale), price: money(order.shipping.priceMinor) }));
  lines.push(fill(copy.total, { total: money(order.totals.totalMinor) }));
  return lines;
}

function customerMail(config: NormalizedEshopConfig, order: Order, kind: MailKind, statusUrl: string) {
  const copy = mailCopy(order.locale);
  const body = [fill(copy.greeting, { name: order.contact.name }), "", fill(copy[kind], { number: order.number }), ""];
  if (kind === "confirmation") body.push(...orderLines(order), "");
  const pay = order.payment.instructions;
  if (kind === "confirmation" && pay) {
    const amount = formatMoney(pay.amountMinor, order.currency, order.locale);
    body.push(fill(copy.payBy, { amount, due: pay.dueDate, iban: pay.iban, vs: pay.variableSymbol }), "");
  }
  if (kind === "shipped" && order.tracking) body.push(fill(copy.tracking, { tracking: order.tracking }), "");
  if (statusUrl) body.push(fill(copy.status, { url: statusUrl }));
  body.push("", config.shop.name);
  return { subject: `${fill(copy[kind], { number: order.number })} | ${config.shop.name}`, text: body.join("\n"), to: order.contact.email };
}

function operatorMail(config: NormalizedEshopConfig, order: Order) {
  const copy = mailCopy(config.shop.defaultLocale);
  const text = [
    fill(copy.operator, { number: order.number }),
    "",
    `${order.contact.name} <${order.contact.email}> ${order.contact.phone}`,
    "",
    ...orderLines(order)
  ];
  return { subject: fill(copy.operator, { number: order.number }), text: text.join("\n"), to: config.mail.operator };
}

export { createMailer, customerMail, operatorMail };
export type { MailAttachment, MailKind, Mailer, MailMessage };
