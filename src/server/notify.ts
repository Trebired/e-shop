import { SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./../constants.js";
import type { Order } from "./../types.js";
import { signRequest } from "./signing.js";

type EshopEvent = { order: Pick<Order, "number"|"status"|"totals"|"currency"|"createdAt">; type: string };

const EVENT_TIMEOUT_MS = 5000;

async function postEvent(url: string, token: string, event: EshopEvent): Promise<boolean> {
  if (!url || !token) return false;
  const body = JSON.stringify(event);
  const target = new URL(url);
  const timestamp = Date.now();
  try {
    const response = await fetch(target, {
        body,
        headers: {
          "content-type": "application/json",
          [SIGNATURE_HEADER]: signRequest(token, { body, method: "POST", path: target.pathname, timestamp }),
          [TIMESTAMP_HEADER]: String(timestamp),
        },
        method: "POST",
        signal: AbortSignal.timeout(EVENT_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function orderEvent(type: string, order: Order): EshopEvent {
  return { order: { createdAt: order.createdAt, currency: order.currency, number: order.number, status: order.status, totals: order.totals }, type };
}

export { orderEvent, postEvent };
export type { EshopEvent };
