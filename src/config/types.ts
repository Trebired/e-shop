import type { Localized, ShippingKind } from "./../types.js";

type ShippingMethodConfig = { freeFromMinor?: number; id: string; kind: ShippingKind; label: Localized; priceMinor: number };

type BankTransferConfig = { accountName: string; dueDays?: number; iban: string; message?: string };

type GatewaysConfig = {
  comgate?: { merchant: string; test?: boolean };
  gopay?: { goid: string; sandbox?: boolean };
  stripe?: { enabled: boolean };
};

type PacketaConfig = { apiKey: string; sender: string };

type InvoiceSupplier = {
  city: string;
  companyId: string;
  country: string;
  name: string;
  postalCode: string;
  registration?: string;
  street: string;
  vatId?: string;
  vatPayer: boolean;
};

type InvoicesConfig = { supplier: InvoiceSupplier };

type NormalizedGateways = {
  comgate: { merchant: string; test: boolean } | null;
  gopay: { goid: string; sandbox: boolean } | null;
  stripe: { enabled: true } | null;
};

type EshopConfig = {
  basePath?: string;
  cart?: { cookie?: string; ttlDays?: number };
  forVersion?: string;
  mail?: { from?: string; operator?: string };
  accounts?: { resetPath?: string };
  invoices?: InvoicesConfig;
  orders?: { statusPath?: string };
  packeta?: PacketaConfig;
  payments?: GatewaysConfig& { bankTransfer?: BankTransferConfig };
  shipping?: ShippingMethodConfig[];
  shop: { currency?: string; defaultLocale?: string; locales?: string[]; name: string };
  vat?: { defaultRate?: number };
};

type NormalizedEshopConfig = {
  basePath: string;
  cart: { cookie: string; ttlDays: number };
  forVersion: string;
  mail: { from: string; operator: string };
  accounts: { resetPath: string } | null;
  invoices: { supplier: Required<InvoiceSupplier> } | null;
  orders: { statusPath: string };
  packeta: PacketaConfig | null;
  payments: NormalizedGateways& { bankTransfer: Required<BankTransferConfig>|null };
  shipping: Required<ShippingMethodConfig>[];
  shop: { currency: string; defaultLocale: string; locales: string[]; name: string };
  vat: { defaultRate: number };
};

type LoadedEshopConfig = { config: NormalizedEshopConfig; configPath: string | null };

export type {
  BankTransferConfig,
  EshopConfig,
  GatewaysConfig,
  InvoicesConfig,
  InvoiceSupplier,
  LoadedEshopConfig,
  NormalizedEshopConfig,
  NormalizedGateways,
  PacketaConfig,
  ShippingMethodConfig,
};
