import type { Localized, ShippingKind } from "./../types.js";

type ShippingMethodConfig = { freeFromMinor?: number; id: string; kind: ShippingKind; label: Localized; priceMinor: number };

type BankTransferConfig = { accountName: string; dueDays?: number; iban: string; message?: string };

type EshopConfig = {
  basePath?: string;
  cart?: { cookie?: string; ttlDays?: number };
  forVersion?: string;
  mail?: { from?: string; operator?: string };
  orders?: { statusPath?: string };
  payments?: { bankTransfer?: BankTransferConfig };
  shipping?: ShippingMethodConfig[];
  shop: { currency?: string; defaultLocale?: string; locales?: string[]; name: string };
  vat?: { defaultRate?: number };
};

type NormalizedEshopConfig = {
  basePath: string;
  cart: { cookie: string; ttlDays: number };
  forVersion: string;
  mail: { from: string; operator: string };
  orders: { statusPath: string };
  payments: { bankTransfer: Required<BankTransferConfig>|null };
  shipping: Required<ShippingMethodConfig>[];
  shop: { currency: string; defaultLocale: string; locales: string[]; name: string };
  vat: { defaultRate: number };
};

type LoadedEshopConfig = { config: NormalizedEshopConfig; configPath: string | null };

export type { BankTransferConfig, EshopConfig, LoadedEshopConfig, NormalizedEshopConfig, ShippingMethodConfig };
