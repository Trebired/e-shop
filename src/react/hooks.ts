import { useEffect, useState } from "react";
import type { Category, Order, Product } from "./../types.js";
import { storefrontRequest } from "./api.js";
import { useStorefront } from "./context.js";

type Loaded<T> = { data: T | null; error: string; loading: boolean };

function useLoad<T>(path: string | null): Loaded<T> {
  const { basePath } = useStorefront();
  const [state, setState] = useState<Loaded<T>>({ data: null, error: "", loading: Boolean(path) });
  useEffect(() => {
      if (!path) return;
      let live = true;
      setState((current) => ({ ...current, loading: true }));
      storefrontRequest<T>(basePath, path)
      .then((data) => live && setState({ data, error: "", loading: false }))
      .catch ((error: Error) => live && setState({ data: null, error: error.message, loading: false }));
      return () => {
        live = false;
      };
    }, [basePath, path]);
  return state;
}

function useCatalog(query: { limit?: number; offset?: number; q?: string } = {}) {
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
  return useLoad<{categories:Category[];items:Product[];total:number}>(`/catalog${params.size ? `?${params}` : ""}`);
}

function useProduct(slug: string) {
  return useLoad<{product:Product}>(slug ? `/products/${encodeURIComponent(slug)}` : null);
}

function useOrder(token: string) {
  return useLoad<{order:Order}>(token ? `/orders/${encodeURIComponent(token)}` : null);
}

export { useCatalog, useOrder, useProduct };
export type { Loaded };
