import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Cart } from "./../types.js";
import { storefrontRequest } from "./api.js";
import { storefrontCopy, type StorefrontCopy } from "./copy.js";

type Storefront = {
  basePath: string;
  cart: Cart | null;
  copy: StorefrontCopy;
  locale: string;
  refreshCart: () => Promise<void>;
  setCartItem: (variantId: string, quantity: number) => Promise<Cart>;
};

const StorefrontContext = createContext<Storefront | null>(null);

function EshopProvider(props: { basePath?: string; children?: ReactNode; locale: string }) {
  const basePath = props.basePath ?? "/eshop";
  const [cart, setCart] = useState<Cart | null>(null);
  const refreshCart = useCallback(async () => {
      setCart((await storefrontRequest<{ cart: Cart }>(basePath, "/cart")).cart);
    }, [basePath]);
  const setCartItem = useCallback(async (variantId: string, quantity: number) => {
      const next = (await storefrontRequest<{ cart: Cart }>(basePath, "/cart/items", { quantity, variantId })).cart;
      setCart(next);
      return next;
    }, [basePath]);
  useEffect(() => {
      void refreshCart().catch (() => undefined);
    }, [refreshCart]);
  const value = useMemo(
    () => ({ basePath, cart, copy: storefrontCopy(props.locale), locale: props.locale, refreshCart, setCartItem }),
    [basePath, cart, props.locale, refreshCart, setCartItem],
  );
  return createElement(StorefrontContext.Provider, { value }, props.children);
}

function useStorefront(): Storefront {
  const value = useContext(StorefrontContext);
  if (!value) throw new Error("eshop-provider-missing");
  return value;
}

export { EshopProvider, StorefrontContext, useStorefront };
export type { Storefront };
