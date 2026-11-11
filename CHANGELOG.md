# Changelog

All notable changes to `@trebired/e-shop` will be documented here.

This project follows semantic versioning once published.

## 0.1.0

- Added the e-shop: catalog with categories, products, variants and stock, cart, checkout, orders with a status history, yearly order numbers and VAT per rate.
- Added bank transfer payments with a Czech QR payment code, using the order number as the variable symbol.
- Added the storefront API and the `@trebired/e-shop/react` storefront structure for `@trebired/frontend`.
- Added the signed admin API at `/admin/api/v1` and `createEshopAdminClient`. Requests are signed with HMAC-SHA256, expire after five minutes and are refused when replayed.
- Added order email and signed order events.
