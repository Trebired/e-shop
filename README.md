# @trebired/e-shop

Postgres-backed e-shop for Bun apps: catalog with variants and stock, cart, checkout, orders with a status history, Czech bank transfer payments with a QR code, order email, a storefront structure for `@trebired/frontend`, and a signed admin API that is always on.

The package owns the shop schema, the order rules, the storefront and admin HTTP routes and the storefront components. The app owns its Postgres pool, its pages and their layout, its SMTP account, its public address and the admin token. The package does not own product photography storage, accounting, a customer marketing system or the admin interface itself; an admin application drives it through the admin API.

## Install

Runtime support: Bun 1+.

```sh
bun i @trebired/e-shop
```

## Quick Start

```ts
import http from "node:http";
import pg from "pg";
import { loadConfig } from "@trebired/e-shop/config";
import { createEshop } from "@trebired/e-shop/server";

const { config } = await loadConfig();
const eshop = createEshop({
  adminToken: process.env.ESHOP_ADMIN_TOKEN!,
  config,
  pool: new pg.Pool({ connectionString: process.env.DATABASE_URL }),
  publicUrl: "https://shop.example",
  smtpUrl: process.env.SMTP_URL,
});
await eshop.migrate();

http.createServer((req, res) => eshop.handle(req, res)).listen(3000);
```

In an Express app, mount `eshop.handle` before any body parser: `app.use(eshop.handle)`. The handler reads request bodies itself, because the admin API signs the exact bytes.

## Concepts

### Money and VAT

Every amount is a whole number of minor units: `25000` is 250 Kč. Prices include VAT. An order's `totals.vat` lists the base and the VAT per rate, shipping counted at the default rate.

### Stock

A variant's `stock` is a number or `null` for unlimited. Checkout takes the stock in the same transaction that creates the order, with a conditional update, so two buyers racing for the last item never both get it. Cancelling an order that has not shipped returns its stock.

### Orders

An order moves `pending_payment` to `paid`, `processing`, `shipped` and `delivered`; it can be `cancelled` before it ships and `refunded` once paid. Every change is recorded with the actor in the order history. Order numbers are the year followed by a six-digit counter, and the number doubles as the bank variable symbol.

### Storefront

`@trebired/e-shop/react` gives the pieces a shop page is built from: `EshopProvider`, `ProductGrid`, `ProductCard`, `ProductDetail`, `CartView`, `CheckoutForm` and `OrderStatus`, plus `useCatalog`, `useProduct` and `useOrder`. They render `@trebired/frontend` primitives and namespace classes, ship Czech and English text, and leave layout and routing to the app.

### Admin API

`/eshop/admin/api/v1` covers statistics, products, variants, stock, categories and orders. `GET /products/:id` accepts a product slug in place of its id. Every request carries `x-eshop-timestamp` and `x-eshop-signature`, an HMAC-SHA256 over the timestamp, method, path and body hash with the admin token. A request older than five minutes, signed with another token, or replayed is refused. The API is mounted whenever the shop is, and no option turns it off. `createEshopAdminClient` from `@trebired/e-shop/client` signs requests for an admin application.

## Configuration

### Config File

`.trebired/e-shop/config.ts`:

```ts
import { defineConfig } from "@trebired/e-shop/config";

export default defineConfig({
  forVersion: "0.1.0",
  shop: { name: "Example", currency: "CZK", locales: ["cs", "en"] },
  vat: { defaultRate: 21 },
  shipping: [
    { id: "pickup", kind: "pickup", label: { cs: "Osobní odběr", en: "Pickup" }, priceMinor: 0 },
    { id: "courier", kind: "courier", label: { cs: "Kurýr", en: "Courier" }, priceMinor: 12900, freeFromMinor: 200000 },
  ],
  payments: { bankTransfer: { iban: "CZ6508000000192000145399", accountName: "Example s.r.o.", dueDays: 7 } },
  mail: { from: "shop@example.cz", operator: "orders@example.cz" },
  orders: { statusPath: "/order/{token}" },
});
```

`forVersion` must match the installed major and minor version. `basePath` (default `/eshop`) moves every route; `cart.cookie` and `cart.ttlDays` set the cart cookie.

### Environment

`createEshop` takes the admin token, SMTP URL, public URL and events URL as options; the app reads them from its own environment. The admin token must be at least 32 characters.

## Runtime

### Storage

`migrate()` creates the `eshop_*` tables under a Postgres advisory lock and records each migration in `eshop_schema_migrations`. `pruneCarts()` deletes carts idle longer than `cart.ttlDays`.

### Email

With `smtpUrl` and `mail.from`, the shop emails the customer when an order is placed, paid, shipped or cancelled, and emails `mail.operator` about every new order. Mail runs after the order is saved and never fails a request.

### Events

With `eventsUrl`, every order change is posted there as JSON, signed the same way as admin requests, so an admin application can refresh without polling.

## Public API

### Entrypoints

- `@trebired/e-shop`: types, `formatMoney`, `vatLines`, `localized` and the API constants. Browser safe.
- `@trebired/e-shop/config`: `defineConfig`, `loadConfig`, `normalizeConfig`.
- `@trebired/e-shop/server`: `createEshop`, `migrateEshop`, the catalog and order functions, `signRequest`, `verifySignature`, `spaydString`.
- `@trebired/e-shop/client`: `createEshopAdminClient`, `EshopAdminError`.
- `@trebired/e-shop/react`: the storefront provider, components and hooks.

### Storefront Routes

- `GET /eshop/api/catalog`, `GET /eshop/api/products/:slug`
- `GET /eshop/api/cart`, `POST /eshop/api/cart/items`
- `GET /eshop/api/checkout/options`, `POST /eshop/api/checkout`
- `GET /eshop/api/orders/:token`

POST routes accept only `application/json`.

## What It Does Not Do

This package does not:

- take card payments in this release; Stripe, GoPay and Comgate arrive in later releases behind the same payment interface;
- ship Packeta pickup points, invoices or customer accounts in this release;
- store or resize product images; products refer to image URLs the app serves;
- compute taxes other than VAT included in the price, or handle more than one currency per shop;
- provide an admin interface; it provides the admin API one is built on.
