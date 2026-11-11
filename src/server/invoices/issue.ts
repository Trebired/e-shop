import type { NormalizedEshopConfig } from "./../../config/types.js";
import { localized } from "./../../money.js";
import type { Address, Invoice, InvoiceKind, InvoiceSummary, Order } from "./../../types.js";
import type { Db } from "./../db/database.js";
import { notFound } from "./../errors.js";

const PREFIX: Record<InvoiceKind, string> = { credit_note: "D", invoice: "" };
const INVOICE_OF_ORDER = "select number from eshop_invoices where order_id = $1 and kind = 'invoice'";
const INSERT_INVOICE = "insert into eshop_invoices (order_id, kind, number, data) values ($1, $2, $3, $4) returning *";

function addressLines(address: Address): string[] {
  return [address.street, `${address.postalCode} ${address.city}`.trim(), address.country].filter(Boolean);
}

async function nextNumber(db: Db, kind: InvoiceKind, year: number): Promise<string> {
  const row = await db.one<{value:number}>(
    "insert into eshop_counters (key, value) values ($1, 1) on conflict (key) do update set value = eshop_counters.value + 1 returning value",
    [`${kind}:${year}`],
  );
  return `${PREFIX[kind]}${year}${String(row?.value ?? 1).padStart(6, "0")}`;
}

type InvoiceDraft = Omit<Invoice, "issuedAt"|"number">;

function invoiceLines(order: Order, sign: number, shippingRate: number): Invoice["lines"] {
  const lines = order.lines.map((line) => ({
        name: `${localized(line.name, order.locale)} ${localized(line.variantName, order.locale)}`.trim(),
        quantity: line.quantity,
        totalMinor: sign * line.totalMinor,
        unitPriceMinor: line.unitPriceMinor,
        vatRate: Number(line.vatRate),
  }));
  if (order.shipping.priceMinor) {
    const name = localized(order.shipping.label, order.locale);
    lines.push({ name, quantity: 1, totalMinor: sign * order.shipping.priceMinor, unitPriceMinor: order.shipping.priceMinor, vatRate: shippingRate });
  }
  return lines;
}

function invoiceData(config: NormalizedEshopConfig, order: Order, kind: InvoiceKind, original: string): InvoiceDraft {
  const sign = kind === "credit_note" ? -1 : 1;
  const supplier = (config.invoices as NonNullable<NormalizedEshopConfig["invoices"]>).supplier;
  return {
    currency: order.currency,
    customer: { address: addressLines(order.billingAddress), email: order.contact.email, name: order.billingAddress.name || order.contact.name },
    kind,
    lines: invoiceLines(order, sign, config.vat.defaultRate),
    locale: order.locale,
    orderNumber: order.number,
    originalNumber: original,
    paymentMethod: order.payment.method,
    supplier: {
      address: [supplier.street, `${supplier.postalCode} ${supplier.city}`, supplier.country],
      companyId: supplier.companyId,
      name: supplier.name,
      registration: supplier.registration,
      vatId: supplier.vatId,
    },
    taxableAt: order.paidAt ?? new Date().toISOString(),
    totalMinor: sign * order.totals.totalMinor,
    variableSymbol: order.payment.instructions?.variableSymbol ?? order.number.replace(/\D/gu, "").slice(-10),
    vat: supplier.vatPayer ? order.totals.vat.map((vat) => ({ baseMinor: sign * vat.baseMinor, rate: vat.rate, vatMinor: sign * vat.vatMinor })) : [],
    vatPayer: supplier.vatPayer,
  };
}

function toInvoice(row: any): Invoice {
  return { ...row.data, issuedAt: new Date(row.issued_at).toISOString(), kind: row.kind, number: row.number };
}

async function issueInvoice(db: Db, config: NormalizedEshopConfig, order: Order, kind: InvoiceKind): Promise<Invoice|null> {
  if (!config.invoices) return null;
  return await db.tx(async(tx) => {
      await tx.one("select id from eshop_orders where id = $1 for update", [order.id]);
      const existing = await tx.one("select * from eshop_invoices where order_id = $1 and kind = $2", [order.id, kind]);
      if (existing) return toInvoice(existing);
      const original = kind === "credit_note" ? await tx.one<{number:string}>(INVOICE_OF_ORDER, [order.id]) : null;
      if (kind === "credit_note" && !original) return null;
      const number = await nextNumber(tx, kind, new Date().getUTCFullYear());
      const data = invoiceData(config, order, kind, original?.number ?? "");
      const row = await tx.one(INSERT_INVOICE, [order.id, kind, number, JSON.stringify(data)]);
      return toInvoice(row);
  });
}

async function listInvoices(db: Db, orderId: string): Promise<InvoiceSummary[]> {
  const rows = await db.many("select * from eshop_invoices where order_id = $1 order by issued_at", [orderId]);
  return rows.map((row) => ({
        issuedAt: new Date(row.issued_at).toISOString(),
        kind: row.kind,
        number: row.number,
        totalMinor: Number(row.data.totalMinor),
  }));
}

async function readInvoice(db: Db, number: string, orderId?: string): Promise<Invoice> {
  const row = orderId
  ? await db.one("select * from eshop_invoices where number = $1 and order_id = $2", [number, orderId])
  : await db.one("select * from eshop_invoices where number = $1", [number]);
  if (!row) throw notFound("eshop-invoice-not-found");
  return toInvoice(row);
}

export { issueInvoice, listInvoices, readInvoice };
