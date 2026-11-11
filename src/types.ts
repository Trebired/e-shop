type Localized = Record<string, string>;

type ProductStatus = "active" | "archived" | "draft";
type OrderStatus = "cancelled" | "delivered" | "paid" | "pending_payment" | "processing" | "refunded" | "shipped";
type PaymentStatus = "failed" | "paid" | "pending" | "refunded";
type PaymentMethodKind = "bank_transfer" | "comgate" | "gopay" | "stripe";
type ShippingKind = "courier" | "packeta" | "pickup";

type ProductImage = { alt: string; src: string };

type Variant = {
  active: boolean;
  id: string;
  name: Localized;
  position: number;
  priceMinor: number;
  productId: string;
  sku: string;
  stock: number | null;
  weightGrams: number;
};

type Product = {
  categoryId: string | null;
  createdAt: string;
  description: Localized;
  id: string;
  images: ProductImage[];
  name: Localized;
  slug: string;
  status: ProductStatus;
  updatedAt: string;
  variants: Variant[];
  vatRate: number;
};

type Category = { id: string; name: Localized; parentId: string | null; position: number; slug: string };

type CartLine = {
  image: ProductImage | null;
  productName: Localized;
  productSlug: string;
  quantity: number;
  sku: string;
  totalMinor: number;
  unitPriceMinor: number;
  variantId: string;
  variantName: Localized;
  vatRate: number;
};

type Cart = { currency: string; lines: CartLine[]; subtotalMinor: number };

type Contact = { email: string; name: string; phone: string };
type Address = { city: string; country: string; name: string; postalCode: string; street: string };

type VatLine = { baseMinor: number; rate: number; vatMinor: number };
type OrderTotals = { shippingMinor: number; subtotalMinor: number; totalMinor: number; vat: VatLine[] };

type OrderLine = {
  name: Localized;
  quantity: number;
  sku: string;
  totalMinor: number;
  unitPriceMinor: number;
  variantId: string | null;
  variantName: Localized;
  vatRate: number;
};

type PaymentInstructions = { accountName: string; amountMinor: number; dueDate: string; iban: string; qrSvg: string; variableSymbol: string };

type PickupPoint = { carrierId: string; id: string; name: string };
type PacketaPacket = { barcode: string; id: string; trackingUrl: string };
type OrderShipping = {
  kind: ShippingKind;
  label: Localized;
  methodId: string;
  packet: PacketaPacket | null;
  pickupPoint: PickupPoint | null;
  priceMinor: number;
};
type OrderPayment = {
  instructions: PaymentInstructions | null;
  method: PaymentMethodKind;
  redirectUrl: string;
  reference: string;
  status: PaymentStatus;
};

type InvoiceKind = "credit_note" | "invoice";
type InvoiceLine = { name: string; quantity: number; totalMinor: number; unitPriceMinor: number; vatRate: number };
type InvoiceParty = { address: string[]; companyId: string; name: string; registration: string; vatId: string };
type Invoice = {
  currency: string;
  customer: { address: string[]; email: string; name: string };
  issuedAt: string;
  kind: InvoiceKind;
  lines: InvoiceLine[];
  locale: string;
  number: string;
  orderNumber: string;
  originalNumber: string;
  paymentMethod: PaymentMethodKind;
  supplier: InvoiceParty;
  taxableAt: string;
  totalMinor: number;
  variableSymbol: string;
  vat: VatLine[];
  vatPayer: boolean;
};
type InvoiceSummary = { issuedAt: string; kind: InvoiceKind; number: string; totalMinor: number };

type Order = {
  billingAddress: Address;
  cancelledAt: string | null;
  contact: Contact;
  createdAt: string;
  currency: string;
  deliveredAt: string | null;
  id: string;
  lines: OrderLine[];
  locale: string;
  note: string;
  number: string;
  paidAt: string | null;
  payment: OrderPayment;
  shippedAt: string | null;
  shipping: OrderShipping;
  shippingAddress: Address;
  status: OrderStatus;
  token: string;
  totals: OrderTotals;
  tracking: string;
};

type OrderEvent = { actor: string; createdAt: string; data: Record<string, unknown>; kind: string };

export type {
  Invoice,
  InvoiceKind,
  InvoiceLine,
  InvoiceParty,
  InvoiceSummary,
  Address,
  Cart,
  CartLine,
  Category,
  Contact,
  Localized,
  Order,
  OrderEvent,
  OrderLine,
  OrderPayment,
  OrderShipping,
  OrderStatus,
  OrderTotals,
  PacketaPacket,
  PaymentInstructions,
  PaymentMethodKind,
  PaymentStatus,
  PickupPoint,
  Product,
  ProductImage,
  ProductStatus,
  ShippingKind,
  Variant,
  VatLine,
};
