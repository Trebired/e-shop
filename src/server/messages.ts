type MailCopy = {
  cancelled: string;
  confirmation: string;
  greeting: string;
  item: string;
  operator: string;
  paid: string;
  payBy: string;
  shipped: string;
  shipping: string;
  status: string;
  total: string;
  tracking: string;
};

const COPY: Record<string, MailCopy> = {
  cs: {
    cancelled: "Objednávka {{number}} byla zrušena",
    confirmation: "Děkujeme za objednávku {{number}}",
    greeting: "Dobrý den {{name}},",
    item: "{{quantity}} × {{name}}: {{total}}",
    operator: "Nová objednávka {{number}}",
    paid: "Platba za objednávku {{number}} přijata",
    payBy: "Zaplaťte {{amount}} na účet {{iban}} s variabilním symbolem {{vs}} do {{due}}.",
    shipped: "Objednávka {{number}} je na cestě",
    shipping: "Doprava: {{label}} ({{price}})",
    status: "Stav objednávky: {{url}}",
    total: "Celkem: {{total}}",
    tracking: "Sledování zásilky: {{tracking}}",
  },
  en: {
    cancelled: "Order {{number}} was cancelled",
    confirmation: "Thank you for order {{number}}",
    greeting: "Hello {{name}},",
    item: "{{quantity}} × {{name}}: {{total}}",
    operator: "New order {{number}}",
    paid: "Payment for order {{number}} received",
    payBy: "Pay {{amount}} to account {{iban}} with variable symbol {{vs}} by {{due}}.",
    shipped: "Order {{number}} is on its way",
    shipping: "Shipping: {{label}} ({{price}})",
    status: "Order status: {{url}}",
    total: "Total: {{total}}",
    tracking: "Tracking: {{tracking}}",
  },
};

function mailCopy(locale: string): MailCopy {
  return COPY[locale] ?? (COPY.en as MailCopy);
}

function fill(template: string, values: Record<string, string|number>): string {
  return template.replace(/\{\{(\w+)\}\}/gu, (_, key: string) => String(values[key] ?? ""));
}

export { fill, mailCopy };
export type { MailCopy };
