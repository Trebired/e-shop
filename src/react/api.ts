type StorefrontError = Error& { code: string; details?: unknown; status: number };

async function storefrontRequest<T>(basePath: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${basePath.replace(/\/+$/u, "")}/api${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      headers: body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      method: body === undefined ? "GET" : "POST",
  });
  const json = (await response.json().catch (() => ({}))) as Record<string, any>;
  if (!response.ok) {
    const error = new Error(String(json.error ?? `http_${response.status}`)) as StorefrontError;
    error.code = String(json.error ?? `http_${response.status}`);
    error.details = json.details;
    error.status = response.status;
    throw error;
  }
  return json as T;
}

export { storefrontRequest };
export type { StorefrontError };
