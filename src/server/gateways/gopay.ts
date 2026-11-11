import { gatewayFailed, gatewayRequest, basicAuth } from "./request.js";
import type { Gateway, GatewayOrder, GatewayState, GatewayUrls } from "./types.js";

const SANDBOX_BASE = "https://gw.sandbox.gopay.com/api";
const PRODUCTION_BASE = "https://gate.gopay.cz/api";
const SCOPE = "payment-all";
const EXPIRY_MARGIN_MS = 60000;

type GopaySecrets = { apiBase?: string; clientId: string; clientSecret: string };
type GopayConfig = { goid: string; sandbox: boolean };

const STATES: Record<string, GatewayState> = {
  CANCELED: "failed",
  PAID: "paid",
  PARTIALLY_REFUNDED: "refunded",
  REFUNDED: "refunded",
  TIMEOUTED: "failed",
};

function paymentBody(config: GopayConfig, order: GatewayOrder, urls: GatewayUrls) {
  return {
    amount: order.totalMinor,
    callback: { notification_url: urls.notifyUrl, return_url: urls.returnUrl },
    currency: order.currency,
    items: [{ amount: order.totalMinor, count: 1, name: order.title }],
    lang: order.locale === "cs" ? "CS" : "EN",
    order_description: order.title,
    order_number: order.number,
    payer: { contact: { email: order.email } },
    target: { goid: Number(config.goid), type: "ACCOUNT" },
  };
}

function createGopayGateway(config: GopayConfig, secrets: GopaySecrets): Gateway {
  const base = (secrets.apiBase ?? (config.sandbox ? SANDBOX_BASE : PRODUCTION_BASE)).replace(/\/+$/u, "");
  let cached = { expires: 0, token: "" };
  const token = async(): Promise<string> => {
    if (cached.token && cached.expires > Date.now()) return cached.token;
    const body = new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE });
    const auth = basicAuth(secrets.clientId, secrets.clientSecret);
    const out = await gatewayRequest<{access_token:string;expires_in:number}>("gopay", { auth, body, url: `${base}/oauth2/token` });
    cached = { expires: Date.now() + Number(out.expires_in) * 1000 - EXPIRY_MARGIN_MS, token: out.access_token };
    return cached.token;
  };
  const call = async<T>(path: string, body?: Record<string, unknown>|URLSearchParams) =>
  await gatewayRequest<T>("gopay", { auth: `Bearer ${await token()}`, body, url: `${base}${path}` });
  return {
    kind: "gopay",
    notification: async(route) => route.query.get("id") || null,
    refund: async(reference, amountMinor) => {
      const out = await call<{result:string}>(`/payments/payment/${encodeURIComponent(reference)}/refund`, new URLSearchParams({
            amount: String(amountMinor),
      }));
      if (out.result === "FAILED") throw gatewayFailed("gopay", { reason: "refund-failed" });
    },
    start: async(order, urls) => {
      const out = await call<{gw_url:string;id:number|string}>("/payments/payment", paymentBody(config, order, urls));
      if (!out.gw_url) throw gatewayFailed("gopay", { reason: "no-redirect" });
      return { redirectUrl: out.gw_url, reference: String(out.id) };
    },
    status: async(reference) => STATES[(await call<{state:string}>(`/payments/payment/${encodeURIComponent(reference)}`)).state] ?? "pending",
  };
}

export { createGopayGateway };
