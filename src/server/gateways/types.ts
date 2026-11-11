import type { RouteContext } from "./../http.js";

type GatewayKind = "btcpay" | "comgate" | "gopay" | "stripe";

type GatewayState = "failed" | "paid" | "pending" | "refunded";

type GatewayOrder = {
  currency: string;
  email: string;
  locale: string;
  name: string;
  number: string;
  title: string;
  totalMinor: number;
};

type GatewayUrls = { cancelUrl: string; notifyUrl: string; returnUrl: string };

type Gateway = {
  kind: GatewayKind;
  notification: (route: RouteContext) => Promise<string|null>;
  refund: (reference: string, amountMinor: number) => Promise<{claimUrl:string}|void>;
  start: (order: GatewayOrder, urls: GatewayUrls) => Promise<{redirectUrl:string;reference:string}>;
  status: (reference: string) => Promise<GatewayState>;
};

type GatewaySecrets = {
  btcpay?: { apiKey: string; webhookSecret: string };
  comgate?: { apiBase?: string; secret: string };
  gopay?: { apiBase?: string; clientId: string; clientSecret: string };
  stripe?: { apiBase?: string; secretKey: string; webhookSecret: string };
};

const GATEWAY_KINDS: readonly GatewayKind[] = ["stripe", "gopay", "comgate", "btcpay"];

export { GATEWAY_KINDS };
export type { Gateway, GatewayKind, GatewayOrder, GatewaySecrets, GatewayState, GatewayUrls };
