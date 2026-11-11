type InvoiceCopy = Record<
"amount" | "companyId" | "creditNote" | "customer" | "dueAt" | "invoice" | "invoiceVat" | "issuedAt" | "item" | "notVatPayer" | "order"
|"original" | "paid" | "payment" | "quantity" | "rate" | "base" | "supplier" | "taxableAt" | "total" | "unitPrice" | "variableSymbol" | "vat"
|"vatId" | "vatSummary",
string
>& { methods: Record<string, string> };

const COPY: Record<string, InvoiceCopy> = {
  cs: {
    amount: "Celkem",
    base: "Základ",
    companyId: "IČO",
    creditNote: "Opravný daňový doklad",
    customer: "Odběratel",
    dueAt: "Datum splatnosti",
    invoice: "Faktura",
    invoiceVat: "Faktura · daňový doklad",
    issuedAt: "Datum vystavení",
    item: "Položka",
    methods: {
      bank_transfer: "Bankovní převod",
      comgate: "Platba kartou (Comgate)",
      gopay: "Platba kartou (GoPay)",
      stripe: "Platba kartou (Stripe)",
    },
    notVatPayer: "Neplátce DPH",
    order: "Objednávka",
    original: "K dokladu",
    paid: "Uhrazeno. Neplaťte.",
    payment: "Způsob úhrady",
    quantity: "Množství",
    rate: "Sazba",
    supplier: "Dodavatel",
    taxableAt: "Datum uskutečnění zdanitelného plnění",
    total: "Celkem",
    unitPrice: "Cena za kus",
    variableSymbol: "Variabilní symbol",
    vat: "DPH",
    vatId: "DIČ",
    vatSummary: "Rekapitulace DPH",
  },
  en: {
    amount: "Amount",
    base: "Base",
    companyId: "Company ID",
    creditNote: "Credit note",
    customer: "Customer",
    dueAt: "Due date",
    invoice: "Invoice",
    invoiceVat: "Invoice · tax document",
    issuedAt: "Issue date",
    item: "Item",
    methods: { bank_transfer: "Bank transfer", comgate: "Card (Comgate)", gopay: "Card (GoPay)", stripe: "Card (Stripe)" },
    notVatPayer: "Not a VAT payer",
    order: "Order",
    original: "Corrects document",
    paid: "Paid. Nothing to pay.",
    payment: "Payment",
    quantity: "Quantity",
    rate: "Rate",
    supplier: "Supplier",
    taxableAt: "Date of taxable supply",
    total: "Total",
    unitPrice: "Unit price",
    variableSymbol: "Variable symbol",
    vat: "VAT",
    vatId: "VAT ID",
    vatSummary: "VAT summary",
  },
};

function invoiceCopy(locale: string): InvoiceCopy {
  return COPY[locale] ?? (COPY.en as InvoiceCopy);
}

export { invoiceCopy };
export type { InvoiceCopy };
