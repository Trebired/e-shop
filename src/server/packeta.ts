import type { Order, PacketaPacket } from "./../types.js";
import type { EshopContext } from "./context.js";
import { badRequest, EshopError } from "./errors.js";
import { ORDER_MOVES } from "./../orders.js";
import { readOrder } from "./orders/read.js";

const API_BASE = "https://www.zasilkovna.cz/api/rest";
const TRACKING_URL = "https://tracking.packeta.com/Z";
const LABEL_FORMAT = "A6 on A6";
const PACKETA_TIMEOUT_MS = 15000;

type PacketaSecrets = { apiBase?: string; apiPassword: string };
type XmlValue = string | number | Record<string, string|number>;

function escapeXml(value: unknown): string {
  return String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function xmlOf(name: string, fields: Record<string, XmlValue>): string {
  const inner = Object.entries(fields)
  .map(([key, value]) => (typeof value === "object" ? xmlOf(key, value) : `<${key}>${escapeXml(value)}</${key}>`))
  .join("");
  return `<${name}>${inner}</${name}>`;
}

function tagValue(xml: string, tag: string): string {
  const found = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "u"));
  return found ? (found[1] as string).trim() : "";
}

function createPacketaClient(secrets: PacketaSecrets) {
  const base = secrets.apiBase ?? API_BASE;
  const call = async(method: string, fields: Record<string, XmlValue>): Promise<string> => {
    let text = "";
    try {
      const response = await fetch(base, {
          body: xmlOf(method, { apiPassword: secrets.apiPassword, ...fields }),
          headers: { "content-type": "text/xml; charset=utf-8" },
          method: "POST",
          signal: AbortSignal.timeout(PACKETA_TIMEOUT_MS),
      });
      text = await response.text();
    } catch {
      throw new EshopError(502, "eshop-packeta-failed", { reason: "unreachable" });
    }
    if (tagValue(text, "status") !== "ok") {
      throw new EshopError(502, "eshop-packeta-failed", { fault: tagValue(text, "fault"), message: tagValue(text, "string") });
    }
    return tagValue(text, "result");
  };
  return {
    createPacket: async(attributes: Record<string, string|number>) => {
      const result = await call("createPacket", { packetAttributes: attributes });
      return { barcode: tagValue(result, "barcode"), id: tagValue(result, "id") };
    },
    label: async(packetId: string) => Buffer.from(await call("packetLabelPdf", { format: LABEL_FORMAT, offset: 0, packetId }), "base64"),
  };
}

type PacketaClient = ReturnType<typeof createPacketaClient>;

function splitName(full: string): { name: string; surname: string } {
  const parts = full.trim().split(/\s+/u);
  const surname = parts.length > 1 ? (parts.pop() as string) : "";
  return { name: parts.join(" "), surname };
}

async function orderWeightKg(context: EshopContext, orderId: string): Promise<number> {
  const row = await context.db.one<{grams:string}>(
    `select coalesce(sum(v.weight_grams * l.quantity), 0) as grams from eshop_order_lines l
    left join eshop_variants v on v.id = l.variant_id where l.order_id = $1`,
    [orderId],
  );
  return Math.max(Number(row?.grams ?? 0) / 1000, 0.1);
}

function packetAttributes(context: EshopContext, order: Order, weight: number): Record<string, string|number> {
  const point = order.shipping.pickupPoint;
  if (!point || !context.config.packeta) throw badRequest("eshop-pickup-point-required");
  const person = splitName(order.contact.name);
  const attributes: Record<string, string|number> = {
    addressId: point.carrierId || point.id,
    currency: order.currency,
    email: order.contact.email,
    eshop: context.config.packeta.sender,
    name: person.name,
    number: order.number,
    surname: person.surname,
    value: (order.totals.totalMinor / 100).toFixed(2),
    weight: weight.toFixed(2),
  };
  if (order.contact.phone) attributes.phone = order.contact.phone;
  if (point.carrierId) attributes.carrierPickupPoint = point.id;
  return attributes;
}

async function ensurePacket(context: EshopContext, number: string): Promise<Order> {
  const order = await readOrder(context.db, { number });
  if (order.shipping.kind !== "packeta") throw badRequest("eshop-shipping-invalid");
  if (order.shipping.packet) return order;
  const client = context.packeta;
  if (!client) throw new EshopError(500, "eshop-packeta-not-configured");
  const weight = await orderWeightKg(context, order.id);
  await context.db.tx(async(tx) => {
      const row = await tx.one<{packet:unknown}>("select shipping->'packet' as packet from eshop_orders where id = $1 for update", [order.id]);
      if (row?.packet) return;
      const created = await client.createPacket(packetAttributes(context, order, weight));
      const packet: PacketaPacket = { barcode: created.barcode, id: created.id, trackingUrl: `${TRACKING_URL}${created.id}` };
      await tx.exec("update eshop_orders set shipping = shipping || $2::jsonb where id = $1", [order.id, JSON.stringify({ packet })]);
  });
  return await readOrder(context.db, { number });
}

async function packetLabel(context: EshopContext, number: string): Promise<Buffer> {
  const order = await ensurePacket(context, number);
  if (!context.packeta || !order.shipping.packet) throw new EshopError(500, "eshop-packeta-not-configured");
  return await context.packeta.label(order.shipping.packet.id);
}

async function prepareShipment(context: EshopContext, number: string, input: any): Promise<any> {
  const order = await readOrder(context.db, { number });
  if (order.shipping.kind !== "packeta" || !context.packeta || !ORDER_MOVES.ship.from.includes(order.status)) return input;
  const packet = (await ensurePacket(context, number)).shipping.packet;
  return { ...input, tracking: String(input?.tracking || packet?.barcode || "") };
}

export { createPacketaClient, ensurePacket, packetLabel, prepareShipment };
export type { PacketaClient, PacketaSecrets };
