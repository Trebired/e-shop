# Changelog

All notable changes to `@trebired/e-shop` will be documented here.

This project follows semantic versioning once published.

## 0.6.2

- Accepted `@trebired/frontend` 31 as a peer alongside 30.2, and moved development to frontend 31.0.0 and `@trebired/configs` 0.10.0. The storefront uses no API that frontend 31 changed.

## 0.6.1

- `@trebired/e-shop/config` has a browser build, so a storefront can import the shop config; `loadConfig` and `findConfig` there refuse to run.
- A file under a storefront path, such as `/products/mug.svg`, is no longer taken for a storefront page.
- `ProductDetail` places the image beside the name, price and buying controls, and stacks them on narrow screens.
- A page's `before` slot comes above the page title, so an app can put its own introduction first.
- `CartLink` carries no layout class of its own.

## 0.6.0

- Added the storefront preset. With `storefront` in the config, `eshopStorefront(config)` provides every shop page: catalog with category filters and paging, product, cart, checkout, order, account and password reset. It also provides the page list for the build, a shared `Provider`, `CartLink`, `href()` and page slots for the app's own content.
- `createEshop({ storefrontDir })` serves the built storefront page for each storefront address.
- Order links and password reset links follow the storefront routes unless `orders.statusPath` or `accounts.resetPath` is set.
- Added Bitcoin payments through BTCPay Server: invoices, signed webhooks, and refunds whose claim link the order page shows.
- The catalog API filters by category slug.

## 0.5.1

- `ProductDetail` shows the product name as the page heading and its first image, and leaves out an empty description.
- The order page names the order status in the customer's language instead of showing its code.
- The chosen variant, shipping and payment are shown as selected.
- An order line without a variant name no longer leaves a gap before the price.
- Fixed a React warning about a key passed inside button props in checkout and on the product page.

## 0.5.0

- Added customer accounts: registration, sign-in with an HttpOnly session cookie, sign-out and password reset by email. Failed sign-ins are throttled per email and address.
- Orders placed while signed in belong to the account, and `GET /account` lists them. Checkout without an account is unchanged.
- Added `GET /customers` and `GET /customers/:id` to the admin API, with `customers()` and `customer()` on the admin client.
- Added `AccountView`, `LoginForm`, `RegisterForm`, `ForgotPasswordForm`, `ResetPasswordForm` and `useAccount` to the storefront.
- Several cookies set in one response no longer replace each other.
- Added the `accounts` config and the `eshop_004_accounts` migration.

## 0.4.0

- Added Czech invoices and credit notes. Paying an order issues its invoice and attaches the PDF to the paid email; refunding it, or cancelling it after payment, issues a credit note.
- Invoices and credit notes are numbered per year in their own series and keep a frozen copy of the supplier, customer, lines and VAT.
- Added the `invoices.supplier` config, `GET /orders/:token/invoices/:number` on the storefront, `GET /invoices/:number` on the admin API and `client.invoice()`. The order responses list the order's invoices, and the storefront order page links them.
- The package ships a Noto Sans subset under the SIL Open Font License for the PDF.
- Added the `eshop_003_invoices` migration.

## 0.3.0

- Added Packeta pickup points. A `packeta` shipping method needs a pickup point at checkout, chosen in the Packeta widget that `CheckoutForm` opens.
- Shipping a Packeta order creates its packet once and uses the barcode as the tracking number. Added `POST /orders/:number/packet` and `GET /orders/:number/packet/label` to the admin API, with `createPacket` and `packetLabel` on the admin client.
- Added the `packeta` config and the `createEshop({ packeta: { apiPassword } })` option.
- The order page shows the pickup point and links to parcel tracking. Checkout names the payment methods.

## 0.2.0

- Added card payments through Stripe Checkout, GoPay and Comgate behind one payment interface. Checkout starts the payment and returns `payment.redirectUrl`.
- Gateway notifications and customer returns are confirmed by asking the gateway for the payment status, so a forged or repeated notification changes nothing. Stripe webhooks are also checked against their signature and a five-minute window, and Comgate pushes against the merchant and secret.
- Added `POST /orders/:token/pay` and `POST /orders/:token/refresh`, and the storefront order page offers to pay again after a failed or abandoned payment.
- Refunding, or cancelling a paid card order, returns the money through the gateway first.
- Gateway credentials are `createEshop({ gateways })` options; an enabled gateway without them stops `createEshop`.
- Added the `eshop_002_payment_reference` migration.

## 0.1.2

- Added `orderActionsFor(status)`, `ORDER_MOVES` and `ORDER_ACTIONS` to the root entry, so an admin application offers only the order actions the shop accepts.

## 0.1.1

- The admin API and `client.product()` find a product by its slug as well as by its id.

## 0.1.0

- Added the e-shop: catalog with categories, products, variants and stock, cart, checkout, orders with a status history, yearly order numbers and VAT per rate.
- Added bank transfer payments with a Czech QR payment code, using the order number as the variable symbol.
- Added the storefront API and the `@trebired/e-shop/react` storefront structure for `@trebired/frontend`.
- Added the signed admin API at `/admin/api/v1` and `createEshopAdminClient`. Requests are signed with HMAC-SHA256, expire after five minutes and are refused when replayed.
- Added order email and signed order events.
