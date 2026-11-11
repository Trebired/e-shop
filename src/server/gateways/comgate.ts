import crypto from "node:crypto";
import { basicAuth, gatewayFailed, gatewayRequest } from "./request.js";
import type { Gateway, GatewayOrder, GatewayState, GatewayUrls } from "./types.js";

const API_BASE = "https://payments.comgate.cz";
const LABEL_MAX = 16;
const RETURN_QUERY = "id=${id}&refId=${refId}";

type ComgateConfig = { merchant: string; test: boolean };
type ComgateReply = { code: number | string; message?: string; redirect?: string; status?: string; transId?: string };

const STATES: Record<string, GatewayState> = { CANCELLED: "failed", PAID: "paid" };

function sameSecret(given: string, expected: string): boolean {
  const left = crypto.createHash("sha256").update(given).digest();
  const right = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(left, right);
}

function paymentBody(config: ComgateConfig, order: GatewayOrder, urls: GatewayUrls) {
  const back = `${urls.returnUrl}${urls.returnUrl.includes("?") ? "&" : "?"}${RETURN_QUERY}`;
  return {
    curr: order.currency,
    email: order.email,
    fullName: order.name,
    label: order.number.slice(0, LABEL_MAX),
    lang: order.locale,
    method: "ALL",
    price: order.totalMinor,
    refId: order.number,
    test: config.test,
    url_cancelled: back,
    url_paid: back,
    url_pending: back,
  };
}

function checked(reply: ComgateReply, reason: string): ComgateReply {
  if (Number(reply.code) !== 0) throw gatewayFailed("comgate", { code: reply.code, reason });
  return reply;
}

function createComgateGateway(config: ComgateConfig, secrets: { apiBase?: string; secret: string }): Gateway {
  const base = (secrets.apiBase ?? API_BASE).replace(/\/+$/u, "");
  const auth = basicAuth(config.merchant, secrets.secret);
  const call = async(path: string, body?: Record<string, unknown>, method?: string) =>
  checked(await gatewayRequest<ComgateReply>("comgate", { auth, body, method, url: `${base}${path}` }), path);
  return {
    kind: "comgate",
    notification: async(route) => {
      const raw = (await route.body()).toString("utf8");
      const type = String(route.req.headers?.["content-type"] ?? "");
      const push = type.includes("json") ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
      if (String(push.merchant ?? "") !== config.merchant || !sameSecret(String(push.secret ?? ""), secrets.secret)) return null;
      return String(push.transId ?? "") || null;
    },
    refund: async(reference, amountMinor) => {
      await call("/v2.0/refund.json", { amount: amountMinor, test: config.test, transId: reference });
    },
    start: async(order, urls) => {
      const out = await call("/v2.0/payment.json", paymentBody(config, order, urls));
      if (!out.redirect || !out.transId) throw gatewayFailed("comgate", { reason: "no-redirect" });
      return { redirectUrl: out.redirect, reference: out.transId };
    },
    status: async(reference) => STATES[String((await call(`/v2.0/payment/transId/${encodeURIComponent(reference)}.json`)).status)] ?? "pending",
  };
}

export { createComgateGateway };
