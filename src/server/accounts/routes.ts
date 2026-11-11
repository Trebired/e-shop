import type { EshopContext } from "./../context.js";
import { EshopError } from "./../errors.js";
import { readCookie, setCookie, type createRouter, type RouteContext } from "./../http.js";
import { fill, mailCopy } from "./../messages.js";
import { readOrder } from "./../orders/read.js";
import { endSession, finishReset, login, register, sessionCustomer, SESSION_DAYS, startReset } from "./store.js";
import { createThrottle } from "./throttle.js";

const ORDER_LIMIT = 100;

function sessionCookie(context: EshopContext): string {
  return `${context.config.cart.cookie}_session`;
}

function secure(route: RouteContext): boolean {
  return String(route.req.headers?.["x-forwarded-proto"] ?? route.req.protocol ?? "").startsWith("https");
}

function clientKey(route: RouteContext, email: unknown): string {
  const ip = String(route.req.headers?.["x-forwarded-for"] ?? route.req.socket?.remoteAddress ?? "").split(",")[0]?.trim();
  return `${String(email ?? "").toLowerCase()}|${ip}`;
}

async function currentCustomer(context: EshopContext, route: RouteContext) {
  return await sessionCustomer(context.db, readCookie(route.req, sessionCookie(context)));
}

async function customerOrders(context: EshopContext, customerId: string) {
  const rows = await context.db.many<{number:string}>("select number from eshop_orders where customer_id = $1 order by created_at desc limit $2", [
      customerId,
      ORDER_LIMIT,
  ]);
  return await Promise.all(rows.map(async(row) => await readOrder(context.db, { number: row.number })));
}

async function sendReset(context: EshopContext, email: unknown): Promise<void> {
  const reset = await startReset(context.db, email);
  if (!reset || !context.config.accounts || !context.publicUrl) return;
  const copy = mailCopy(context.config.shop.defaultLocale);
  const url = `${context.publicUrl.replace(/\/+$/u, "")}${context.config.accounts.resetPath.replace("{token}", reset.token)}`;
  const text = [fill(copy.greeting, { name: reset.customer.name }), "", fill(copy.resetBody, { url }), "", context.config.shop.name].join("\n");
  await context.mailer.send({ subject: `${copy.reset} | ${context.config.shop.name}`, text, to: reset.customer.email });
}

function accountRoutes(context: EshopContext, router: ReturnType<typeof createRouter>): void {
  if (!context.config.accounts) return;
  const throttle = createThrottle();
  const signIn = (route: RouteContext, token: string) => setCookie(route.res, sessionCookie(context), token, SESSION_DAYS, secure(route));
  router.add("POST", "/account/register", async(route) => {
      const out = await register(context.db, await route.json());
      signIn(route, out.token);
      return { customer: out.customer };
  });
  router.add("POST", "/account/login", async(route) => {
      const input = await route.json();
      const key = clientKey(route, input?.email);
      if (throttle.blocked(key)) throw new EshopError(429, "eshop-login-throttled");
      try {
        const out = await login(context.db, input);
        throttle.reset(key);
        signIn(route, out.token);
        return { customer: out.customer };
      } catch (error) {
        throttle.fail(key);
        throw error;
      }
  });
  router.add("POST", "/account/logout", async(route) => {
      await endSession(context.db, readCookie(route.req, sessionCookie(context)));
      setCookie(route.res, sessionCookie(context), "", 0, secure(route));
      return { ok: true };
  });
  router.add("GET", "/account", async(route) => {
      const customer = await currentCustomer(context, route);
      return { customer, orders: customer ? await customerOrders(context, customer.id) : [] };
  });
  router.add("POST", "/account/password/forgot", async(route) => {
      const input = await route.json();
      const key = `reset|${clientKey(route, input?.email)}`;
      if (!throttle.blocked(key)) {
        throttle.fail(key);
        await sendReset(context, input?.email).catch (() => undefined);
      }
      return { ok: true };
  });
  router.add("POST", "/account/password/reset", async(route) => {
      const email = await finishReset(context.db, await route.json());
      throttle.resetPrefix(`${email}|`);
      return { ok: true };
  });
}

export { accountRoutes, currentCustomer };
