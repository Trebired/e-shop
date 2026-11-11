import type { NormalizedEshopConfig } from "./../config/types.js";
import type { OrderShipping } from "./../types.js";
import { badRequest } from "./errors.js";
import { text } from "./input.js";

type ShippingOption = { freeFromMinor: number; id: string; kind: string; label: Record<string, string>; priceMinor: number };

function shippingOptions(config: NormalizedEshopConfig, subtotalMinor: number): ShippingOption[] {
  return config.shipping.map((method) => ({
        ...method,
        priceMinor: method.freeFromMinor > 0 && subtotalMinor >= method.freeFromMinor ? 0 : method.priceMinor,
  }));
}

function chooseShipping(config: NormalizedEshopConfig, input: any, subtotalMinor: number): OrderShipping {
  const method = shippingOptions(config, subtotalMinor).find((option) => option.id === input?.shippingMethodId);
  if (!method) throw badRequest("eshop-shipping-invalid");
  const point = input?.pickupPoint;
  if (method.kind === "packeta" && !(point && point.id)) throw badRequest("eshop-pickup-point-required");
  return {
    kind: method.kind as OrderShipping["kind"],
    label: method.label,
    methodId: method.id,
    pickupPoint: method.kind === "packeta" ? { id: text(point.id, "pickupPoint.id", 40), name: text(point.name, "pickupPoint.name", 300) } : null,
    priceMinor: method.priceMinor,
  };
}

export { chooseShipping, shippingOptions };
export type { ShippingOption };
