import { ADMIN_API_VERSION, SIGNATURE_HEADER, SIGNATURE_WINDOW_MS, TIMESTAMP_HEADER } from "./../constants.js";
import { PACKAGE_VERSION } from "./../version.js";
import { deleteCategory, listCategories, saveCategory } from "./catalog/categories.js";
import { deleteProduct, getProduct, listProducts } from "./catalog/products.js";
import { saveProduct } from "./catalog/products.js";
import { deleteVariant, saveVariant, setStock } from "./catalog/variants.js";
import type { EshopContext } from "./context.js";
import { EshopError } from "./errors.js";
import { refundThroughGateway } from "./gateways/flow.js";
import { listCustomers, readCustomer } from "./accounts/admin.js";
import { listInvoices, readInvoice } from "./invoices/issue.js";
import { invoicePdf } from "./invoices/pdf.js";
import { ensurePacket, packetLabel, prepareShipment } from "./packeta.js";
import { createRouter, type RouteContext } from "./http.js";
import { afterOrderChange } from "./lifecycle.js";
import { listOrders, orderEvents, readOrder } from "./orders/read.js";
import { moveOrder, ORDER_ACTIONS, type OrderAction } from "./orders/transitions.js";
import { availablePaymentMethods } from "./payments.js";
import { verifySignature } from "./signing.js";
import { eshopStats } from "./stats.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function productRef(value: string): { id?: string; slug?: string } {
  return UUID_PATTERN.test(value) ? { id: value } : { slug: value };
}

const ACTOR = "admin";

async function authorize(context: EshopContext, route: RouteContext): Promise<void> {
  const signature = String(route.req.headers?.[SIGNATURE_HEADER] ?? "");
  const timestamp = String(route.req.headers?.[TIMESTAMP_HEADER] ?? "");
  const path = new URL(String(route.req.originalUrl ?? route.req.url), "http://local").pathname;
  const valid = verifySignature(context.adminToken, { body: await route.body(), method: String(route.req.method), path, signature, timestamp });
  if (!valid) throw new EshopError(401, "eshop-signature-invalid");
  await context.db.exec("delete from eshop_admin_nonces where seen_at < now() - make_interval(secs => $1::int)", [SIGNATURE_WINDOW_MS / 500]);
  const fresh = await context.db.exec("insert into eshop_admin_nonces (signature) values ($1) on conflict do nothing", [signature]);
  if (!fresh) throw new EshopError(401, "eshop-signature-replayed");
}

function signed(context: EshopContext, handler: (route: RouteContext) => Promise<unknown>) {
  return async(route: RouteContext) => {
    await authorize(context, route);
    return await handler(route);
  };
}

function pageOf(route: RouteContext) {
  return { limit: Number(route.query.get("limit") ?? 50), offset: Number(route.query.get("offset") ?? 0), q: route.query.get("q") ?? undefined };
}

function catalogAdmin(context: EshopContext, add: (method: string, path: string, handler: (route: RouteContext) => Promise<unknown>) => void) {
  const vat = { defaultVat: context.config.vat.defaultRate };
  add(
    "GET",
    "/products",
    async(route) => await listProducts(context.db, { ...pageOf(route), status: (route.query.get("status") as any) ?? undefined })
  );
  add("POST", "/products", async(route) => ({ product: await saveProduct(context.db, await route.json(), vat) }));
  add("GET", "/products/:id", async(route) => ({ product: await getProduct(context.db, productRef(String(route.params.id ?? ""))) }));
  add("PUT", "/products/:id", async(route) => ({ product: await saveProduct(context.db, await route.json(), { ...vat, id: route.params.id }) }));
  add("DELETE", "/products/:id", async(route) => void(await deleteProduct(context.db, route.params.id as string)));
  add("POST", "/products/:id/variants", async(route) => ({ variant: await saveVariant(context.db, route.params.id as string, await route.json()) }));
  add("PUT", "/products/:id/variants/:variantId", async(route) => ({
        variant: await saveVariant(context.db, route.params.id as string, await route.json(), route.params.variantId),
  }));
  add(
    "DELETE",
    "/products/:id/variants/:variantId",
    async(route) => void(await deleteVariant(context.db, route.params.id as string, route.params.variantId as string))
  );
  add(
    "PUT",
    "/variants/:variantId/stock",
    async(route) => ({ variant: await setStock(context.db, route.params.variantId as string, (await route.json()).stock) })
  );
  add("GET", "/categories", async() => ({ categories: await listCategories(context.db) }));
  add("POST", "/categories", async(route) => ({ category: await saveCategory(context.db, await route.json()) }));
  add("PUT", "/categories/:id", async(route) => ({ category: await saveCategory(context.db, await route.json(), route.params.id) }));
  add("DELETE", "/categories/:id", async(route) => void(await deleteCategory(context.db, route.params.id as string)));
}

function orderAdmin(context: EshopContext, add: (method: string, path: string, handler: (route: RouteContext) => Promise<unknown>) => void) {
  add("GET", "/orders", async(route) => await listOrders(context.db, { ...pageOf(route), status: (route.query.get("status") as any) ?? undefined }));
  add("GET", "/orders/:number", async(route) => {
      const order = await readOrder(context.db, { number: route.params.number });
      return { events: await orderEvents(context.db, order.id), invoices: await listInvoices(context.db, order.id), order };
  });
  add("GET", "/customers", async(route) => await listCustomers(context.db, pageOf(route)));
  add("GET", "/customers/:id", async(route) => await readCustomer(context.db, route.params.id as string));
  add("GET", "/invoices/:number", async(route) => {
      const invoice = await readInvoice(context.db, route.params.number as string);
      return { invoice, pdf: (await invoicePdf(invoice)).toString("base64") };
  });
  add("POST", "/orders/:number/packet", async(route) => ({ order: await ensurePacket(context, route.params.number as string) }));
  add("GET", "/orders/:number/packet/label", async(route) => ({
        pdf: (await packetLabel(context, route.params.number as string)).toString("base64"),
  }));
  add("POST", "/orders/:number/:action", async(route) => {
      const action = route.params.action as OrderAction;
      if (!ORDER_ACTIONS.includes(action)) throw new EshopError(404, "eshop-action-unknown");
      const body = await route.json();
      const input = action === "ship" ? await prepareShipment(context, route.params.number as string, body) : body;
      await refundThroughGateway(context, route.params.number as string, action);
      const order = await moveOrder(context.db, route.params.number as string, action, input, ACTOR);
      await afterOrderChange(context, order, action);
      return { order };
  });
  add("GET", "/stats", async(route) => await eshopStats(context.db, { from: route.query.get("from"), to: route.query.get("to") }));
  add("GET", "/info", async() => ({
        currency: context.config.shop.currency,
        locales: context.config.shop.locales,
        name: context.config.shop.name,
        payments: availablePaymentMethods(context.config),
        shipping: context.config.shipping,
        version: PACKAGE_VERSION,
  }));
}

function adminRouter(context: EshopContext) {
  const router = createRouter(`${context.config.basePath}/admin/api/${ADMIN_API_VERSION}`);
  const add = (
    method: string,
    path: string,
    handler: (route: RouteContext) => Promise<unknown>
  ) => router.add(method, path, signed(context, handler));
  catalogAdmin(context, add);
  orderAdmin(context, add);
  return router;
}

export { adminRouter };
