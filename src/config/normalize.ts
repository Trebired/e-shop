import { resolveForVersion } from "@trebired/utils";

const SUPPORTED_SHIPPING = ["pickup", "courier"];

import { PACKAGE_VERSION } from "./../version.js";
import type { BankTransferConfig, EshopConfig, NormalizedEshopConfig, ShippingMethodConfig } from "./types.js";

const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/u;
const ID = /^[a-z0-9_-]{1,40}$/u;

function invalid(message: string): Error {
  return new Error(`e-shop-invalid-config :: ${message}`);
}

function minor(value: unknown, label: string): number {
  const amount = Number(value ?? 0);
  if (!Number.isInteger(amount) || amount < 0) throw invalid(`${label} must be a whole number of minor units`);
  return amount;
}

function normalizeShipping(list: ShippingMethodConfig[] | undefined): Required<ShippingMethodConfig>[] {
  const methods = (list ?? []).map((method) => {
      if (!ID.test(String(method.id))) throw invalid(`shipping id is invalid: ${String(method.id)}`);
      if (!SUPPORTED_SHIPPING.includes(method.kind)) throw invalid(`shipping kind is not supported: ${String(method.kind)}`);
      return { freeFromMinor: minor(
          method.freeFromMinor,
          "shipping.freeFromMinor"
        ), id: method.id, kind: method.kind, label: method.label, priceMinor: minor(method.priceMinor, "shipping.priceMinor") };
  });
  if (new Set(methods.map((method) => method.id)).size !== methods.length) throw invalid("shipping ids must be unique");
  return methods;
}

function normalizeBank(value: BankTransferConfig | undefined): Required<BankTransferConfig>|null {
  if (!value) return null;
  const iban = String(value.iban || "").replace(/\s+/gu, "").toUpperCase();
  if (!IBAN.test(iban)) throw invalid("payments.bankTransfer.iban is not an IBAN");
  return {
    accountName: String(value.accountName || ""),
    dueDays: Math.max(1, Number(value.dueDays ?? 7)),
    iban,
    message: String(value.message || ""),
  };
}

function normalizeConfig(config: EshopConfig, options: { configPath?: string; requireForVersion?: boolean } = {}): NormalizedEshopConfig {
  if (!config || typeof config !== "object" || !config.shop?.name) throw invalid("shop.name is required");
  const locales = config.shop.locales?.length ? config.shop.locales : ["cs"];
  const basePath = `/${String(config.basePath ?? "/eshop").replace(/^\/+|\/+$/gu, "")}`;
  return {
    basePath,
    cart: { cookie: config.cart?.cookie ?? "eshop_cart", ttlDays: Math.max(1, Number(config.cart?.ttlDays ?? 30)) },
    forVersion: resolveForVersion({
        config,
        configPath: options.configPath,
        forVersion: config.forVersion,
        label: "e-shop",
        packageVersion: PACKAGE_VERSION,
        requireForVersion: options.requireForVersion,
    }),
    mail: { from: String(config.mail?.from ??""), operator: String(config.mail?.operator ?? "") },
    orders: { statusPath: String(config.orders?.statusPath ?? "/order/{token}") },
    payments: { bankTransfer: normalizeBank(config.payments?.bankTransfer) },
    shipping: normalizeShipping(config.shipping),
    shop: {
      currency: String(config.shop.currency ?? "CZK").toUpperCase(),
      defaultLocale: config.shop.defaultLocale ?? (locales[0] as string),
      locales,
      name: config.shop.name,
    },
    vat: { defaultRate: Number(config.vat?.defaultRate ?? 21) },
  };
}

function defineConfig(config: EshopConfig): EshopConfig {
  return config;
}

export { defineConfig, normalizeConfig };
