import crypto from "node:crypto";
import { gatewayFailed, gatewayRequest } from "./request.js";
import type { Gateway, GatewayOrder, GatewayState, GatewayUrls } from "./types.js";

type BtcpayConfig = { serverUrl: string; storeId: string };
type BtcpaySecrets = { apiKey: string; webhookSecret: string };
type Invoice = { checkoutLink: string; id: string; status: string };

const STATES: Record<string, GatewayState> = { Expired: "failed", Invalid: "failed", Settled: "paid" };
const SIGNATURE_PREFIX = "sha256=";

function verifyBtcpaySignature(secret: string, header: string, body: Buffer): boolean {
  if (!header.startsWith(SIGNATURE_PREFIX)) return false;
  const given = Buffer.from(header.slice(SIGNATURE_PREFIX.length), "hex");
  const expected = crypto.createHmac("sha256", secret).update(body).digest();
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

function invoiceBody(order: GatewayOrder, urls: GatewayUrls) {
  return {
    amount: (order.totalMinor / 100).toFixed(2),
    checkout: {
      defaultLanguage: order.locale,
      redirectAutomatically: true,
      redirectURL: `${urls.returnUrl}${urls.returnUrl.includes("?") ? "&" : "?"}id={InvoiceId}`,
    },
    currency: order.currency,
    metadata: { buyerEmail: order.email, buyerName: order.name, itemDesc: order.title, orderId: order.number },
  };
}

function createBtcpayGateway(config: BtcpayConfig, secrets: BtcpaySecrets): Gateway {
  const base = `${config.serverUrl.replace(/\/+$/u, "")}/api/v1`;
  const auth = `token ${secrets.apiKey}`;
  const invoice = (id: string) => gatewayRequest<Invoice>("btcpay", { auth, url: `${base}/invoices/${encodeURIComponent(id)}` });
  return {
    kind: "btcpay",
    notification: async(route) => {
      const body = await route.body();
      if (!verifyBtcpaySignature(secrets.webhookSecret, String(route.req.headers?.["btcpay-sig"] ?? ""), body)) return null;
      const event = JSON.parse(body.toString("utf8"));
      return event?.storeId === config.storeId && event?.invoiceId ? String(event.invoiceId) : "";
    },
    refund: async(reference) => {
      const pull = await gatewayRequest<{viewLink:string}>("btcpay", {
          auth,
          body: { refundVariant: "Fiat" },
          url: `${base}/invoices/${encodeURIComponent(reference)}/refund`,
      });
      if (!pull.viewLink) throw gatewayFailed("btcpay", { reason: "no-refund-link" });
      return { claimUrl: pull.viewLink };
    },
    start: async(order, urls) => {
      const url = `${base}/stores/${encodeURIComponent(config.storeId)}/invoices`;
      const created = await gatewayRequest<Invoice>("btcpay", { auth, body: invoiceBody(order, urls), url });
      if (!created.checkoutLink) throw gatewayFailed("btcpay", { reason: "no-redirect" });
      return { redirectUrl: created.checkoutLink, reference: created.id };
    },
    status: async(reference) => STATES[(await invoice(reference)).status] ?? "pending",
  };
}

export { createBtcpayGateway, verifyBtcpaySignature };
