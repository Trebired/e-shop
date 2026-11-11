import { useLocale } from "@trebired/frontend/react";
import { useContext, type ComponentType, type ReactNode } from "react";
import type { EshopConfig, NormalizedEshopConfig } from "./../../config/types.js";
import { matchStorefrontRoute, storefrontPath, storefrontShellPaths } from "./../../storefront.js";
import { classes } from "./../classes.js";
import { EshopProvider, StorefrontContext, useStorefront } from "./../context.js";
import { PRESET_PAGES } from "./pages.js";
import { ScopeContext, storefrontScope, useStorefrontScope, type StorefrontScope, type StorefrontSlots } from "./settings.js";

function ScopeProvider(props: { children?: ReactNode; scope: StorefrontScope }) {
  const locale = useLocale().locale || props.scope.defaultLocale;
  const shared = useContext(StorefrontContext);
  const body = <ScopeContext.Provider value={props.scope}>{props.children}</ScopeContext.Provider>;
  return shared ? body : <EshopProvider basePath={props.scope.basePath} locale={locale}>{body}</EshopProvider>;
}

function CartLinkView(props: { className?: string }) {
  const { cart, copy } = useStorefront();
  const { settings } = useStorefrontScope();
  const count = cart?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  const label = count ? `${copy.cart} (${count})` : copy.cart;
  return <a className={props.className ?? classes("inline-row", "gap-xs")} href={storefrontPath(settings, "cart")}>{label}</a>;
}

function eshopStorefront(config: EshopConfig | NormalizedEshopConfig, options: { slots?: StorefrontSlots } = {}) {
  const scope = storefrontScope(config, options.slots);
  const views = Object.fromEntries(
    Object.entries(PRESET_PAGES).map(([page, View]) => [page, () => <ScopeProvider scope={scope}><View /></ScopeProvider>]),
  ) as Record<string, ComponentType>;
  return {
    CartLink: (props: { className?: string }) => <ScopeProvider scope={scope}><CartLinkView {...props} /></ScopeProvider>,
    href: (page: Parameters<typeof storefrontPath>[1], param = "") => storefrontPath(scope.settings, page, param),
    pages: (route: string) => {
      const match = matchStorefrontRoute(scope.settings, route);
      return match ? async() => views[match.page] as ComponentType : undefined;
    },
    paths: storefrontShellPaths(scope.settings),
    Provider: (props: { children?: ReactNode }) => <ScopeProvider scope={scope}>{props.children}</ScopeProvider>,
    settings: scope.settings,
  };
}

type EshopStorefront = ReturnType<typeof eshopStorefront>;

export { eshopStorefront };
export type { EshopStorefront, StorefrontSlots };
