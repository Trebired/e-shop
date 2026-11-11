import type { NormalizedEshopConfig } from "./../../config/types.js";
import { createComgateGateway } from "./comgate.js";
import { createGopayGateway } from "./gopay.js";
import { createStripeGateway } from "./stripe.js";
import type { Gateway, GatewayKind, GatewaySecrets } from "./types.js";

type Gateways = Partial<Record<GatewayKind, Gateway>>;

function missing(kind: string): Error {
  return new Error(`e-shop-gateway-secrets-missing :: payments.${kind} is enabled but createEshop got no gateways.${kind} credentials`);
}

function createGateways(config: NormalizedEshopConfig, secrets: GatewaySecrets = {}): Gateways {
  const out: Gateways = {};
  const payments = config.payments;
  if (payments.stripe) {
    if (!secrets.stripe?.secretKey || !secrets.stripe.webhookSecret) throw missing("stripe");
    out.stripe = createStripeGateway(secrets.stripe);
  }
  if (payments.gopay) {
    if (!secrets.gopay?.clientId || !secrets.gopay.clientSecret) throw missing("gopay");
    out.gopay = createGopayGateway(payments.gopay, secrets.gopay);
  }
  if (payments.comgate) {
    if (!secrets.comgate?.secret) throw missing("comgate");
    out.comgate = createComgateGateway(payments.comgate, secrets.comgate);
  }
  return out;
}

export { createGateways };
export type { Gateways };
