import crypto from "node:crypto";
import type { RouteContext } from "./../http.js";
import { gatewayFailed, gatewayRequest } from "./request.js";
import type { Gateway, GatewayOrder, GatewayState, GatewayUrls } from "./types.js";

const API_BASE = "https://api.stripe.com";
const TOLERANCE_SECONDS = 300;
const SESSION_EVENT = "checkout.session.";

type Session = { id: string; payment_intent: string | null; payment_status: string; status: string; url: string | null };

function verifyStripeSignature(secret: string, header: string, body: Buffer, now = Date.now()): boolean {
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => String(value));
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${body.toString("utf8")}`).digest();
  return signatures.some((signature) => {
      const given = Buffer.from(signature, "hex");
      return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

function sessionForm(order: GatewayOrder, urls: GatewayUrls): URLSearchParams {
  return new URLSearchParams({
      cancel_url: urls.cancelUrl,
      client_reference_id: order.number,
      customer_email: order.email,
      "line_items[0][price_data][currency]": order.currency.toLowerCase(),
      "line_items[0][price_data][product_data][name]": order.title,
      "line_items[0][price_data][unit_amount]": String(order.totalMinor),
      "line_items[0][quantity]": "1",
      locale: order.locale === "cs" ? "cs" : "auto",
      "metadata[order_number]": order.number,
      mode: "payment",
      "payment_intent_data[metadata][order_number]": order.number,
      success_url: `${urls.returnUrl}${urls.returnUrl.includes("?") ? "&" : "?"}id={CHECKOUT_SESSION_ID}`,
  });
}

function sessionState(session: Session): GatewayState {
  if (session.payment_status === "paid" || session.payment_status === "no_payment_required") return "paid";
  return session.status === "expired" ? "failed" : "pending";
}

function createStripeGateway(secrets: { apiBase?: string; secretKey: string; webhookSecret: string }): Gateway {
  const base = (secrets.apiBase ?? API_BASE).replace(/\/+$/u, "");
  const auth = `Bearer ${secrets.secretKey}`;
  const session = (id: string) => gatewayRequest<Session>("stripe", { auth, url: `${base}/v1/checkout/sessions/${encodeURIComponent(id)}` });
  return {
    kind: "stripe",
    notification: async(route: RouteContext) => {
      const body = await route.body();
      if (!verifyStripeSignature(secrets.webhookSecret, String(route.req.headers?.["stripe-signature"] ?? ""), body)) return null;
      const event = JSON.parse(body.toString("utf8"));
      const id = String(event?.data?.object?.id ?? "");
      return String(event?.type ??"").startsWith(SESSION_EVENT) && id ? id : "";
    },
    refund: async(reference, amountMinor) => {
      const intent = (await session(reference)).payment_intent;
      if (!intent) throw gatewayFailed("stripe", { reason: "no-payment" });
      const body = new URLSearchParams({ amount: String(amountMinor), payment_intent: intent });
      await gatewayRequest("stripe", { auth, body, url: `${base}/v1/refunds` });
    },
    start: async(order, urls) => {
      const created = await gatewayRequest<Session>("stripe", { auth, body: sessionForm(order, urls), url: `${base}/v1/checkout/sessions` });
      if (!created.url) throw gatewayFailed("stripe", { reason: "no-redirect" });
      return { redirectUrl: created.url, reference: created.id };
    },
    status: async(reference) => sessionState(await session(reference)),
  };
}

export { createStripeGateway, verifyStripeSignature };
