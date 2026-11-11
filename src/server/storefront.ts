import { availablePaymentMethods } from "./payments.js";
import { listCategories } from "./catalog/categories.js";
import { getProduct, listProducts } from "./catalog/products.js";
import { ensureCart, readCart, setCartItem } from "./cart.js";
import type { EshopContext } from "./context.js";
import { createRouter, readCookie, sendPdf, setCookie, type RouteContext } from "./http.js";
import { accountRoutes, currentCustomer } from "./accounts/routes.js";
import { startPayment } from "./gateways/flow.js";
import { gatewayRoutes } from "./gateways/routes.js";
import { afterOrderChange } from "./lifecycle.js";
import { listInvoices, readInvoice } from "./invoices/issue.js";
import { invoicePdf } from "./invoices/pdf.js";
import { placeOrder } from "./orders/checkout.js";
import { readOrder } from "./orders/read.js";
import { shippingOptions } from "./shipping.js";

function cartToken(context: EshopContext, route: RouteContext): Promise<string> {
  return ensureCart(context.db, readCookie(route.req, context.config.cart.cookie)).then((token) => {
      const secure = String(route.req.headers?.["x-forwarded-proto"] ?? route.req.protocol ?? "").startsWith("https");
      setCookie(route.res, context.config.cart.cookie, token, context.config.cart.ttlDays, secure);
      return token;
  });
}

function catalogRoutes(context: EshopContext, router: ReturnType<typeof createRouter>): void {
  router.add("GET", "/catalog", async(route) => ({
        categories: await listCategories(context.db),
        ...(await listProducts(context.db, {
              activeOnly: true,
              limit: Number(route.query.get("limit") ?? 50),
              offset: Number(route.query.get("offset") ?? 0),
              q: route.query.get("q") ?? undefined,
              category: route.query.get("category") ?? undefined,
        })),
  }));
  router.add("GET", "/products/:slug", async(route) => ({ product: await getProduct(context.db, { slug: route.params.slug }, true) }));
}

function cartRoutes(context: EshopContext, router: ReturnType<typeof createRouter>): void {
  const currency = context.config.shop.currency;
  router.add("GET", "/cart", async(route) => ({ cart: await readCart(context.db, await cartToken(context, route), currency) }));
  router.add("POST", "/cart/items", async(route) => {
      const token = await cartToken(context, route);
      await setCartItem(context.db, token, await route.json());
      return { cart: await readCart(context.db, token, currency) };
  });
  router.add("GET", "/checkout/options", async(route) => {
      const cart = await readCart(context.db, await cartToken(context, route), currency);
      return {
        locales: context.config.shop.locales,
        packeta: context.config.packeta ? { apiKey: context.config.packeta.apiKey } : null,
        payments: availablePaymentMethods(context.config),
        shipping: shippingOptions(context.config, cart.subtotalMinor),
      };
  });
}

function checkoutRoutes(context: EshopContext, router: ReturnType<typeof createRouter>): void {
  router.add("POST", "/checkout", async(route) => {
      const customer = context.config.accounts ? await currentCustomer(context, route) : null;
      const order = await placeOrder(context.db, context.config, await cartToken(context, route), await route.json(), customer?.id ?? null);
      await afterOrderChange(context, order, "created");
      if (!context.gateways[order.payment.method as keyof typeof context.gateways]) return { order };
      return { order: await startPayment(context, order).catch (() => order) };
  });
  router.add("GET", "/orders/:token", async(route) => {
      const order = await readOrder(context.db, { token: route.params.token });
      return { invoices: await listInvoices(context.db, order.id), order };
  });
  router.add("GET", "/orders/:token/invoices/:number", async(route) => {
      const order = await readOrder(context.db, { token: route.params.token });
      const invoice = await readInvoice(context.db, route.params.number as string, order.id);
      sendPdf(route.res, `${invoice.number}.pdf`, await invoicePdf(invoice));
  });
}

function storefrontRouter(context: EshopContext) {
  const router = createRouter(`${context.config.basePath}/api`);
  catalogRoutes(context, router);
  cartRoutes(context, router);
  checkoutRoutes(context, router);
  gatewayRoutes(context, router);
  accountRoutes(context, router);
  return router;
}

export { storefrontRouter };
