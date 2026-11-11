import { ADMIN_API_VERSION, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./../constants.js";
import { signRequest } from "./../server/signing.js";
import type { Category, Order, OrderEvent, Product, Variant } from "./../types.js";

type AdminClientOptions = { basePath?: string; baseUrl: string; timeoutMs?: number; token: string };
type Page<T> = { items: T[]; total: number };
type ListQuery = { limit?: number; offset?: number; q?: string; status?: string };

class EshopAdminError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly status: number;

  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function queryString(query: Record<string, unknown> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : "";
}

function createRequester(options: AdminClientOptions) {
  const root = new URL(options.baseUrl);
  const prefix = `${String(options.basePath ?? "/eshop").replace(/\/+$/u, "")}/admin/api/${ADMIN_API_VERSION}`;
  return async <T > (method: string, path: string, body?: unknown): Promise<T> => {
    const url = new URL(`${prefix}${path}`, root);
    const payload = body === undefined ? "" : JSON.stringify(body);
    const timestamp = Date.now();
    const response = await fetch(url, {
        body: payload || undefined,
        headers: {
          ...(payload ? { "content-type": "application/json" } : {}),
          [SIGNATURE_HEADER]: signRequest(options.token, { body: payload, method, path: url.pathname, timestamp }),
          [TIMESTAMP_HEADER]: String(timestamp),
        },
        method,
        signal: AbortSignal.timeout(options.timeoutMs ?? 10000),
    });
    const json = (await response.json().catch (() => ({}))) as Record<string, any>;
    if (!response.ok) throw new EshopAdminError(response.status, String(json.error ?? `http_${response.status}`), json.details);
    return json as T;
  };
}

function createEshopAdminClient(options: AdminClientOptions) {
  const request = createRequester(options);
  return {
    action: (number: string, action: string, input: Record<string, unknown> = {}) =>
    request<{order:Order}>("POST", `/orders/${encodeURIComponent(number)}/${encodeURIComponent(action)}`, input),
    categories: () => request<{categories:Category[]}>("GET", "/categories"),
    deleteProduct: (id: string) => request<{ok:true}>("DELETE", `/products/${encodeURIComponent(id)}`),
    info: () => request<{currency:string;locales:string[];name:string;payments:string[];version:string}>("GET", "/info"),
    order: (number: string) => request<{events:OrderEvent[];order:Order}>("GET", `/orders/${encodeURIComponent(number)}`),
    orders: (query: ListQuery = {}) => request<Page<Order>>("GET", `/orders${queryString(query)}`),
    product: (id: string) => request<{product:Product}>("GET", `/products/${encodeURIComponent(id)}`),
    products: (query: ListQuery = {}) => request<Page<Product>>("GET", `/products${queryString(query)}`),
    saveProduct: (input: Record<string, unknown>, id?: string) =>
    request<{product:Product}>(id ? "PUT" : "POST", id ? `/products/${encodeURIComponent(id)}` : "/products", input),
    saveVariant: (productId: string, input: Record<string, unknown>, id?: string) =>
    request<{variant:Variant}>(
      id ? "PUT" : "POST",
      `/products/${encodeURIComponent(productId)}/variants${id ? `/${encodeURIComponent(id)}` : ""}`,
      input,
    ),
    setStock: (
      variantId: string,
      stock: number | null
    ) => request<{variant:Variant}>("PUT", `/variants/${encodeURIComponent(variantId)}/stock`, { stock }),
    stats: (range: { from?: string; to?: string } = {}) => request<Record<string, any>>("GET", `/stats${queryString(range)}`),
  };
}

type EshopAdminClient = ReturnType<typeof createEshopAdminClient>;

export { createEshopAdminClient, EshopAdminError };
export type { AdminClientOptions, EshopAdminClient, ListQuery, Page };
