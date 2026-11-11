import { createContext, useContext, type ComponentType } from "react";
import { normalizeConfig } from "./../../config/normalize.js";
import type { EshopConfig, NormalizedEshopConfig } from "./../../config/types.js";
import type { StorefrontPage, StorefrontSettings } from "./../../storefront.js";

type StorefrontSlots = Partial<Record<StorefrontPage, { after?: ComponentType; before?: ComponentType }>>;

type StorefrontScope = {
  basePath: string;
  currency: string;
  defaultLocale: string;
  settings: StorefrontSettings;
  slots: StorefrontSlots;
};

const ScopeContext = createContext<StorefrontScope | null>(null);

function isNormalized(config: EshopConfig | NormalizedEshopConfig): config is NormalizedEshopConfig {
  const candidate = config as NormalizedEshopConfig;
  return typeof candidate.basePath === "string" && "storefront" in config && Array.isArray(candidate.shipping);
}

function storefrontScope(config: EshopConfig | NormalizedEshopConfig, slots: StorefrontSlots = {}): StorefrontScope {
  const normalized = isNormalized(config) ? config : normalizeConfig(config, { requireForVersion: false });
  if (!normalized.storefront) throw new Error("e-shop-storefront-missing :: add storefront to the e-shop config to use the preset pages");
  return {
    basePath: normalized.basePath,
    currency: normalized.shop.currency,
    defaultLocale: normalized.shop.defaultLocale,
    settings: normalized.storefront,
    slots,
  };
}

function useStorefrontScope(): StorefrontScope {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("e-shop-storefront-scope-missing");
  return scope;
}

export { ScopeContext, storefrontScope, useStorefrontScope };
export type { StorefrontScope, StorefrontSlots };
