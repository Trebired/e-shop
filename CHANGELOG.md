# Changelog

All notable changes to `@trebired/e-shop` will be documented here.

This project follows semantic versioning once published.

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
