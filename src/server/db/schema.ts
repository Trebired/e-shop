const SCHEMA_V1 = [
  `create table eshop_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name jsonb not null default '{}'::jsonb,
  parent_id uuid references eshop_categories(id) on delete set null,
  position integer not null default 0
  )`,
  `create table eshop_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  category_id uuid references eshop_categories(id) on delete set null,
  images jsonb not null default '[]'::jsonb,
  vat_rate numeric(5, 2) not null default 21,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  )`,
  "create index eshop_products_status on eshop_products (status, updated_at desc)",
  `create table eshop_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references eshop_products(id) on delete cascade,
  sku text not null unique,
  name jsonb not null default '{}'::jsonb,
  price_minor bigint not null check (price_minor >= 0),
  stock integer check (stock is null or stock >= 0),
  weight_grams integer not null default 0,
  active boolean not null default true,
  position integer not null default 0
  )`,
  "create index eshop_variants_product on eshop_variants (product_id, position)",
  `create table eshop_carts (
  token text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  )`,
  `create table eshop_cart_items (
  cart_token text not null references eshop_carts(token) on delete cascade,
  variant_id uuid not null references eshop_variants(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  primary key (cart_token, variant_id)
  )`,
  `create table eshop_counters (
  key text primary key,
  value bigint not null default 0
  )`,
  `create table eshop_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  token text not null unique,
  status text not null check (status in ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  currency text not null,
  locale text not null,
  contact jsonb not null,
  billing_address jsonb not null,
  shipping_address jsonb not null,
  shipping jsonb not null,
  payment jsonb not null,
  totals jsonb not null,
  total_minor bigint not null,
  note text not null default '',
  tracking text not null default '',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz
  )`,
  "create index eshop_orders_created on eshop_orders (created_at desc)",
  "create index eshop_orders_status on eshop_orders (status, created_at desc)",
  `create table eshop_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references eshop_orders(id) on delete cascade,
  variant_id uuid references eshop_variants(id) on delete set null,
  sku text not null,
  name jsonb not null,
  variant_name jsonb not null,
  unit_price_minor bigint not null,
  quantity integer not null,
  vat_rate numeric(5, 2) not null,
  total_minor bigint not null,
  position integer not null
  )`,
  "create index eshop_order_lines_order on eshop_order_lines (order_id, position)",
  `create table eshop_order_events (
  id bigserial primary key,
  order_id uuid not null references eshop_orders(id) on delete cascade,
  kind text not null,
  actor text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
  )`,
  "create index eshop_order_events_order on eshop_order_events (order_id, id)",
  `create table eshop_admin_nonces (
  signature text primary key,
  seen_at timestamptz not null default now()
  )`,
];

const PAYMENTS_V2 = ["create index eshop_orders_payment_reference on eshop_orders ((payment->>'method'), (payment->>'reference'))"];

const INVOICES_V3 = [
  `create table eshop_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references eshop_orders(id) on delete restrict,
  kind text not null,
  number text not null unique,
  issued_at timestamptz not null default now(),
  data jsonb not null,
  unique (order_id, kind)
  )`,
  "create index eshop_invoices_order on eshop_invoices (order_id, issued_at)",
];

const ACCOUNTS_V4 = [
  `create table eshop_customers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
  )`,
  `create table eshop_customer_sessions (
  token_hash text primary key,
  customer_id uuid not null references eshop_customers(id) on delete cascade,
  expires_at timestamptz not null
  )`,
  "create index eshop_customer_sessions_customer on eshop_customer_sessions (customer_id)",
  `create table eshop_password_resets (
  token_hash text primary key,
  customer_id uuid not null references eshop_customers(id) on delete cascade,
  expires_at timestamptz not null
  )`,
  "alter table eshop_orders add column customer_id uuid references eshop_customers(id) on delete set null",
  "create index eshop_orders_customer on eshop_orders (customer_id, created_at desc)",
];

const MIGRATIONS = [
  { id: "eshop_001_core", statements: SCHEMA_V1 },
  { id: "eshop_002_payment_reference", statements: PAYMENTS_V2 },
  { id: "eshop_003_invoices", statements: INVOICES_V3 },
  { id: "eshop_004_accounts", statements: ACCOUNTS_V4 },
];

export { MIGRATIONS };
