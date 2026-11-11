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

const POINT_ID = /^[0-9a-z-]{1,40}$/iu;

function pickupPointOf(point: any): OrderShipping["pickupPoint"] {
  const id = String(point.id ?? "");
  const carrierId = String(point.carrierId ?? "");
  if (!POINT_ID.test(id) || (carrierId && !/^\d{1,10}$/u.test(carrierId))) throw badRequest("eshop-pickup-point-required");
  return { carrierId, id, name: text(point.name, "pickupPoint.name", 300) };
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
    packet: null,
    pickupPoint: method.kind === "packeta" ? pickupPointOf(point) : null,
    priceMinor: method.priceMinor,
  };
}

export { chooseShipping, shippingOptions };
export type { ShippingOption };
