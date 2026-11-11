import type { EshopContext } from "./../context.js";
import { notFound } from "./../errors.js";
import type { createRouter, RouteContext } from "./../http.js";
import { statusUrl } from "./../lifecycle.js";
import { readOrder } from "./../orders/read.js";
import { orderByReference, refreshPayment, startPayment } from "./flow.js";
import type { Gateway, GatewayKind } from "./types.js";

function gatewayFor(context: EshopContext, route: RouteContext): Gateway {
  const gateway = context.gateways[route.params.kind as GatewayKind];
  if (!gateway) throw notFound("eshop-gateway-not-found");
  return gateway;
}

async function notify(context: EshopContext, route: RouteContext) {
  const gateway = gatewayFor(context, route);
  const reference = await gateway.notification(route).catch (() => null);
  if (reference === null) {
    route.res.statusCode = 401;
    route.res.end();
    return;
  }
  const order = reference ? await orderByReference(context, gateway.kind, reference) : null;
  if (order) await refreshPayment(context, order);
  return { ok: true };
}

async function returnFromGateway(context: EshopContext, route: RouteContext) {
  const gateway = gatewayFor(context, route);
  const order = await orderByReference(context, gateway.kind, route.query.get("id") ?? "");
  const current = order ? await refreshPayment(context, order).catch (() => order) : null;
  route.res.statusCode = 303;
  route.res.setHeader("location", current ? statusUrl(context, current) || "/" : context.publicUrl || "/");
  route.res.end();
}

function gatewayRoutes(context: EshopContext, router: ReturnType<typeof createRouter>): void {
  router.add("POST", "/orders/:token/pay", async(route) => ({
        order: await startPayment(context, await readOrder(context.db, { token: route.params.token })),
  }));
  router.add("POST", "/orders/:token/refresh", async(route) => ({
        order: await refreshPayment(context, await readOrder(context.db, { token: route.params.token })),
  }));
  router.add("POST", "/payments/:kind/notify", async(route) => await notify(context, route));
  router.add("GET", "/payments/:kind/notify", async(route) => await notify(context, route));
  router.add("GET", "/payments/:kind/return", async(route) => await returnFromGateway(context, route));
}

export { gatewayRoutes };
