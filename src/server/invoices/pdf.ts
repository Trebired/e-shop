import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { formatMoney } from "./../../money.js";
import type { Invoice } from "./../../types.js";
import { invoiceCopy, type InvoiceCopy } from "./copy.js";

const FONT_DIR = new URL("./../../../assets/fonts/", import.meta.url);
const REGULAR = fileURLToPath(new URL("NotoSans-Regular.ttf", FONT_DIR));
const BOLD = fileURLToPath(new URL("NotoSans-Bold.ttf", FONT_DIR));
const MARGIN = 48;
const LOCALES: Record<string, string> = { cs: "cs-CZ", en: "en-GB" };

type Doc = PDFKit.PDFDocument;
type Cell = { align?: "left" | "right"; text: string; width: number };

function date(value: string, locale: string): string {
  return new Date(value).toLocaleDateString(LOCALES[locale] ?? locale, { timeZone: "Europe/Prague" });
}

const VAT_WIDTHS = [199, 100, 100, 100];

function columns(values: string[], widths: number[]): Cell[] {
  return values.map((text, index) => ({ align: index ? "right" : "left", text, width: widths[index] as number }));
}

function row(doc: Doc, cells: Cell[], bold = false): void {
  const top = doc.y;
  let x = MARGIN;
  let bottom = top;
  doc.font(bold ? "bold" : "regular");
  for (const cell of cells) {
    doc.text(cell.text, x, top, { align: cell.align ?? "left", width: cell.width });
    bottom = Math.max(bottom, doc.y);
    x += cell.width;
  }
  doc.x = MARGIN;
  doc.y = bottom + 4;
}

function party(doc: Doc, x: number, top: number, title: string, lines: string[]): number {
  doc.font("bold").fontSize(9).text(title, x, top, { width: 240 });
  doc.font("regular").fontSize(10);
  for (const line of lines.filter(Boolean)) doc.text(line, x, doc.y, { width: 240 });
  return doc.y;
}

function heading(doc: Doc, invoice: Invoice, copy: InvoiceCopy): void {
  const title = invoice.kind === "credit_note" ? copy.creditNote : invoice.vatPayer ? copy.invoiceVat : copy.invoice;
  doc.font("bold").fontSize(18).text(`${title} ${invoice.number}`, MARGIN, MARGIN);
  doc.moveDown(1);
  const top = doc.y;
  const supplier = invoice.supplier;
  const left = party(doc, MARGIN, top, copy.supplier, [
      supplier.name,
      ...supplier.address,
      `${copy.companyId}: ${supplier.companyId}`,
      invoice.vatPayer ? `${copy.vatId}: ${supplier.vatId}` : copy.notVatPayer,
      supplier.registration,
  ]);
  const right = party(doc, 310, top, copy.customer, [invoice.customer.name, ...invoice.customer.address, invoice.customer.email]);
  doc.x = MARGIN;
  doc.y = Math.max(left, right) + 16;
}

function facts(doc: Doc, invoice: Invoice, copy: InvoiceCopy): void {
  const rows: [string, string][] = [
    [copy.issuedAt, date(invoice.issuedAt, invoice.locale)],
    ...(invoice.vatPayer ? [[copy.taxableAt, date(invoice.taxableAt, invoice.locale)] as [string, string]] : []),
    [copy.dueAt, date(invoice.issuedAt, invoice.locale)],
    [copy.variableSymbol, invoice.variableSymbol],
    [copy.order, invoice.orderNumber],
    [copy.payment, copy.methods[invoice.paymentMethod] ?? invoice.paymentMethod],
    ...(invoice.originalNumber ? [[copy.original, invoice.originalNumber] as [string, string]] : []),
  ];
  doc.fontSize(10);
  for (const [label, value] of rows) row(doc, [{ text: label, width: 220 }, { text: value, width: 279 }]);
  doc.moveDown(1);
}

function lines(doc: Doc, invoice: Invoice, copy: InvoiceCopy): void {
  const money = (minor: number) => formatMoney(minor, invoice.currency, LOCALES[invoice.locale] ?? invoice.locale);
  const vat = invoice.vatPayer;
  const widths = vat ? [215, 60, 90, 44, 90] : [259, 60, 90, 90];
  const header = [copy.item, copy.quantity, copy.unitPrice, ...(vat ? [copy.vat] : []), copy.amount];
  const cells = (values: string[]) => columns(values, widths);
  doc.fontSize(9);
  row(doc, cells(header), true);
  for (const line of invoice.lines) {
    if (doc.y > doc.page.height - MARGIN - 120) doc.addPage();
    row(doc, cells([line.name, String(line.quantity), money(line.unitPriceMinor), ...(vat ? [`${line.vatRate} %`] : []), money(line.totalMinor)]));
  }
  doc.moveDown(1);
}

function totals(doc: Doc, invoice: Invoice, copy: InvoiceCopy): void {
  const money = (minor: number) => formatMoney(minor, invoice.currency, LOCALES[invoice.locale] ?? invoice.locale);
  if (invoice.vat.length) {
    doc.fontSize(9);
    row(doc, columns([copy.vatSummary, copy.rate, copy.base, copy.vat], VAT_WIDTHS), true);
    for (const line of invoice.vat) {
      row(doc, columns(["", `${line.rate} %`, money(line.baseMinor), money(line.vatMinor)], VAT_WIDTHS));
    }
    doc.moveDown(1);
  }
  doc.fontSize(14);
  row(doc, [{ text: copy.total, width: 299 }, { align: "right", text: money(invoice.totalMinor), width: 200 }], true);
  if (invoice.kind === "invoice") doc.font("regular").fontSize(10).text(copy.paid, MARGIN, doc.y, { align: "right", width: 499 });
}

async function invoicePdf(invoice: Invoice): Promise<Buffer> {
  const copy = invoiceCopy(invoice.locale);
  const doc = new PDFDocument({ info: { Title: `${invoice.number}` }, margin: MARGIN, size: "A4" });
  doc.registerFont("regular", REGULAR);
  doc.registerFont("bold", BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  heading(doc, invoice, copy);
  facts(doc, invoice, copy);
  lines(doc, invoice, copy);
  totals(doc, invoice, copy);
  doc.end();
  return await done;
}

export { invoicePdf };
