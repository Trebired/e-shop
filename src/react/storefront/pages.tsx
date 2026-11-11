import { button, Text, Title, useCurrentUrl, usePageRoute } from "@trebired/frontend/react";
import { Fragment, type ReactNode } from "react";
import { matchStorefrontRoute, storefrontPath, type StorefrontPage } from "./../../storefront.js";
import { AccountView, ResetPasswordForm } from "./../account.js";
import { CartView } from "./../cart.js";
import { CheckoutForm } from "./../checkout.js";
import { classes } from "./../classes.js";
import { useStorefront } from "./../context.js";
import { useCatalog, useProduct } from "./../hooks.js";
import { localized } from "./../../money.js";
import { OrderStatus } from "./../order.js";
import { ProductDetail, ProductGrid } from "./../products.js";
import { useStorefrontScope } from "./settings.js";

function useRouteParam(): string {
  const { settings } = useStorefrontScope();
  return matchStorefrontRoute(settings, usePageRoute())?.param ?? "";
}

function Section(props: { children: ReactNode; page: StorefrontPage; title?: string }) {
  const { slots } = useStorefrontScope();
  const Before = slots[props.page]?.before;
  const After = slots[props.page]?.after;
  return (
    <section className={classes("column", "gap-md")}>
    {props.title ? <Title level={1}>{props.title}</Title> : null}
    {Before ? <Before /> : null}
    {props.children}
    {After ? <After /> : null}
    </section>
  );
}

function CategoryChoice(props: { current: string }) {
  const { copy, locale } = useStorefront();
  const catalog = useCatalog({ limit: 1 });
  const categories = catalog.data?.categories ?? [];
  if (!categories.length) return null;
  const items = [
    { href: "?", label: copy.allProducts, slug: "" },
    ...categories.map((item) => ({ href: `?category=${encodeURIComponent(item.slug)}`, label: localized(item.name, locale), slug: item.slug })),
  ];
  return (
    <div className={classes("inline-row", "gap-xs", "wrap")}>
    {items.map((item) => (
          <Fragment key={item.slug || "all"}>
          {button({ children: item.label, href: item.href, variant: item.slug === props.current ? "primary" : "secondary" })}
          </Fragment>
    ))}
    </div>
  );
}

function CatalogPage() {
  const { copy } = useStorefront();
  const { currency, settings } = useStorefrontScope();
  const url = useCurrentUrl();
  const category = url.searchParams.get("category") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const catalog = useCatalog({ category: category || undefined, limit: settings.catalog.pageSize * page });
  const items = catalog.data?.items ?? [];
  const more = new URLSearchParams(url.searchParams);
  more.set("page", String(page + 1));
  return (
    <Section page="catalog" title={copy.products}>
    {settings.catalog.categories ? <CategoryChoice current={category} /> : null}
    {catalog.data && !items.length ? <Text muted>{copy.noProducts}</Text> : null}
    <ProductGrid currency={currency} productHref={(product) => storefrontPath(settings, "product", product.slug)} products={items} />
    {catalog.data && items.length < catalog.data.total ? (
        <div className={classes("inline-row", "hor-right")}>{button({ children: copy.more, href: `?${more}`, variant: "secondary" })}</div>
      ) : null}
    </Section>
  );
}

function ProductPage() {
  const { copy } = useStorefront();
  const { currency, settings } = useStorefrontScope();
  const loaded = useProduct(useRouteParam());
  return (
    <Section page="product">
    {loaded.data ? <ProductDetail currency={currency} product={loaded.data.product} /> : null}
    {loaded.error ? <Text muted>{copy.productMissing}</Text> : null}
    <a href={storefrontPath(settings, "catalog")}>{copy.allProducts}</a>
    </Section>
  );
}

function CartPage() {
  const { copy } = useStorefront();
  const { settings } = useStorefrontScope();
  return (
    <Section page="cart" title={copy.cart}>
    <CartView checkoutHref={storefrontPath(settings, "checkout")} continueHref={storefrontPath(settings, "catalog")} />
    </Section>
  );
}

function CheckoutPage() {
  const { copy } = useStorefront();
  const { settings } = useStorefrontScope();
  return (
    <Section page="checkout" title={copy.checkout}>
    <CheckoutForm
    onPlaced={(order) => {
        if (!order.payment.redirectUrl) window.location.assign(storefrontPath(settings, "order", order.token));
    }}
    />
    </Section>
  );
}

function OrderPage() {
  const { copy } = useStorefront();
  const token = useRouteParam();
  return <Section page="order" title={copy.yourOrder}>{token ? <OrderStatus token={token} /> : null}</Section>;
}

function AccountPage() {
  const { copy } = useStorefront();
  const { settings } = useStorefrontScope();
  return (
    <Section page="account" title={copy.account}>
    <AccountView orderHref={(order) => storefrontPath(settings, "order", order.token)} />
    </Section>
  );
}

function ResetPage() {
  const { copy } = useStorefront();
  const token = useRouteParam();
  return <Section page="reset" title={copy.setPassword}>{token ? <ResetPasswordForm token={token} /> : null}</Section>;
}

const PRESET_PAGES: Record<StorefrontPage, () => ReactNode> = {
  account: AccountPage,
  cart: CartPage,
  catalog: CatalogPage,
  checkout: CheckoutPage,
  order: OrderPage,
  product: ProductPage,
  reset: ResetPage,
};

export { PRESET_PAGES };
