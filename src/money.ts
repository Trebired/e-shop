import type { Localized, VatLine } from "./types.js";

const MINOR_UNITS = 100;

function formatMoney(minor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { currency, style: "currency" }).format(minor / MINOR_UNITS);
}

function vatOfGross(grossMinor: number, rate: number): number {
  return Math.round((grossMinor * rate) / (100 + rate));
}

function vatLines(amounts: { grossMinor: number; rate: number }[]): VatLine[] {
  const byRate = new Map<number, number>();
  for (const amount of amounts) byRate.set(amount.rate, (byRate.get(amount.rate) ?? 0) + amount.grossMinor);
  return [...byRate.entries()]
  .sort((left, right) => right[0] - left[0])
  .map(([rate, gross]) => {
      const vatMinor = vatOfGross(gross, rate);
      return { baseMinor: gross - vatMinor, rate, vatMinor };
  });
}

function localized(value: Localized | undefined, locale: string, fallback = ""): string {
  if (!value) return fallback;
  return value[locale] ?? Object.values(value)[0] ?? fallback;
}

export { formatMoney, localized, MINOR_UNITS, vatLines, vatOfGross };
