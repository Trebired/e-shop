import type { Localized } from "./../types.js";
import { badRequest } from "./errors.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SKU = /^[A-Za-z0-9._-]{1,64}$/u;

function text(value: unknown, field: string, max = 500): string {
  const out = String(value ?? "").trim();
  if (out.length > max) throw badRequest("eshop-text-too-long", { field, max });
  return out;
}

function localizedText(value: unknown, field: string, max = 500): Localized {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest("eshop-localized-required", { field });
  const out: Localized = {};
  for (const [locale, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[a-z]{2}$/u.test(locale)) throw badRequest("eshop-locale-invalid", { field, locale });
    out[locale] = text(entry, field, max);
  }
  return out;
}

function slug(value: unknown): string {
  const out = String(value ?? "").trim();
  if (!SLUG.test(out) || out.length > 120) throw badRequest("eshop-slug-invalid");
  return out;
}

function sku(value: unknown): string {
  const out = String(value ?? "").trim();
  if (!SKU.test(out)) throw badRequest("eshop-sku-invalid");
  return out;
}

function wholeNumber(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const out = Number(value);
  if (!Number.isInteger(out) || out < min || out > max) throw badRequest("eshop-number-invalid", { field });
  return out;
}

function optionalStock(value: unknown): number | null {
  return value === null || value === undefined || value === "" ? null : wholeNumber(value, "stock", 0, 10_000_000);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) throw badRequest("eshop-value-invalid", { field });
  return value as T;
}

function uuid(value: unknown, field: string): string {
  const out = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(out)) throw badRequest("eshop-id-invalid", { field });
  return out;
}

export { localizedText, oneOf, optionalStock, sku, slug, text, uuid, wholeNumber };
