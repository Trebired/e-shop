const ORDER_STATUSES = ["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;
const PAYMENT_METHODS = ["bank_transfer", "stripe", "gopay", "comgate"] as const;
const SHIPPING_KINDS = ["pickup", "courier", "packeta"] as const;
const ADMIN_API_VERSION = "v1";
const SIGNATURE_HEADER = "x-eshop-signature";
const TIMESTAMP_HEADER = "x-eshop-timestamp";
const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

export { ADMIN_API_VERSION, ORDER_STATUSES, PAYMENT_METHODS, SHIPPING_KINDS, SIGNATURE_HEADER, SIGNATURE_WINDOW_MS, TIMESTAMP_HEADER };
