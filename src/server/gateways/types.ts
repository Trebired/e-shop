import type { RouteContext } from "./../http.js";

type GatewayKind = "comgate" | "gopay" | "stripe";

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
  refund: (reference: string, amountMinor: number) => Promise<void>;
  start: (order: GatewayOrder, urls: GatewayUrls) => Promise<{redirectUrl:string;reference:string}>;
  status: (reference: string) => Promise<GatewayState>;
};

type GatewaySecrets = {
  comgate?: { apiBase?: string; secret: string };
  gopay?: { apiBase?: string; clientId: string; clientSecret: string };
  stripe?: { apiBase?: string; secretKey: string; webhookSecret: string };
};

const GATEWAY_KINDS: readonly GatewayKind[] = ["stripe", "gopay", "comgate"];

export { GATEWAY_KINDS };
export type { Gateway, GatewayKind, GatewayOrder, GatewaySecrets, GatewayState, GatewayUrls };
