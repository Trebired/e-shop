import { classes } from "./classes.js";
import { button, input, Stack, Text, Title } from "@trebired/frontend/react";
import { Fragment, useState, type ChangeEvent } from "react";
import { formatMoney, localized } from "./../money.js";
import type { Product } from "./../types.js";
import { useStorefront } from "./context.js";

function priceOf(product: Product): number {
  return Math.min(...product.variants.map((variant) => variant.priceMinor), Number.MAX_SAFE_INTEGER);
}

function ProductCard(props: { currency: string; href: string; product: Product }) {
  const { locale } = useStorefront();
  const image = props.product.images[0];
  return (
    <a className={classes("card", "column", "gap-xs")} href={props.href}>
    {image ? <img alt={image.alt} className={classes("width-full")} loading="lazy" src={image.src} /> : null}
    <Text>{localized(props.product.name, locale)}</Text>
    {props.product.variants.length ? <Text muted>{formatMoney(priceOf(props.product), props.currency, locale)}</Text> : null}
    </a>
  );
}

function ProductGrid(props: { currency: string; productHref: (product: Product) => string; products: Product[] }) {
  return (
    <div className={classes("grid", "auto-md", "gap-sm")}>
    {props.products.map((product) => <ProductCard currency={props.currency} href={props.productHref(product)} key={product.id} product={product} />)}
    </div>
  );
}

function VariantPicker(props: { onPick: (id: string) => void; value: string; variants: Product["variants"] }) {
  const { locale } = useStorefront();
  if (props.variants.length < 2) return null;
  return (
    <div className={classes("inline-row", "gap-xs", "wrap")}>
    {props.variants.map((entry) => (
          <Fragment key={entry.id}>
          {button({
                active: entry.id === props.value,
                children: localized(entry.name, locale, entry.sku),
                onClick: () => props.onPick(entry.id),
                variant: entry.id === props.value ? "primary" : "secondary",
          })}
          </Fragment>
    ))}
    </div>
  );
}

function ProductDetail(props: { currency: string; product: Product }) {
  const { copy, locale, setCartItem } = useStorefront();
  const variants = props.product.variants;
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const variant = variants.find((entry) => entry.id === variantId);
  const soldOut = !variant || (variant.stock !== null && variant.stock < 1);
  const add = async () => {
    try {
      await setCartItem(variantId, quantity);
      setMessage(copy.added);
    } catch {
      setMessage(copy.error);
    }
  };
  const image = props.product.images[0];
  const description = localized(props.product.description, locale);
  return (
    <Stack gap="sm">
    <Title level={1}>{localized(props.product.name, locale)}</Title>
    {image ? <img alt={image.alt} className={classes("width-full")} src={image.src} /> : null}
    {description ? <Text>{description}</Text> : null}
    <VariantPicker onPick={setVariantId} value={variantId} variants={variants} />
    {variant ? <Text as="strong">{formatMoney(variant.priceMinor, props.currency, locale)}</Text> : null}
    {input({
          label: copy.quantity,
          min: 1,
          onChange: (event: ChangeEvent<HTMLInputElement>) => setQuantity(Math.max(1, Number(event.target.value) || 1)),
          size: "sm",
          type: "number",
          value: quantity,
    })}
    {button({ children: soldOut ? copy.outOfStock : copy.add, disabled: soldOut, onClick: () => void add(), variant: "primary" })}
    {message ? <Text muted size="sm">{message}</Text> : null}
    </Stack>
  );
}

export { ProductCard, ProductDetail, ProductGrid };
