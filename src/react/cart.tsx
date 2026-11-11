import { classes } from "./classes.js";
import { button, input, Stack, Text } from "@trebired/frontend/react";
import type { ChangeEvent } from "react";
import { formatMoney, localized } from "./../money.js";
import type { CartLine } from "./../types.js";
import { useStorefront } from "./context.js";

function CartRow(props: { line: CartLine }) {
  const { copy, locale, setCartItem, cart } = useStorefront();
  const { line } = props;
  const money = (minor: number) => formatMoney(minor, cart?.currency ?? "CZK", locale);
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const quantity = Math.max(0, Number(event.target.value) || 0);
    void setCartItem(line.variantId, quantity).catch (() => undefined);
  };
  return (
    <div className={classes("card", "inline-row", "gap-sm", "ver-center", "wrap")}>
    {line.image ? <img alt={line.image.alt} className={classes("width-xs")} src={line.image.src} /> : null}
    <div className={classes("column", "grow")}>
    <Text>{localized(line.productName, locale)}</Text>
    <Text muted size="sm">{localized(line.variantName, locale, line.sku)}</Text>
    </div>
    {input({ label: copy.quantity, min: 0, onChange: change, size: "sm", type: "number", value: line.quantity })}
    <Text>{money(line.totalMinor)}</Text>
    {button({ children: copy.remove, onClick: () => void setCartItem(line.variantId, 0).catch (() => undefined), variant: "secondary" })}
    </div>
  );
}

function CartView(props: { checkoutHref: string; continueHref?: string }) {
  const { cart, copy, locale } = useStorefront();
  if (!cart) return null;
  if (!cart.lines.length) return <Text muted>{copy.empty}</Text>;
  return (
    <Stack gap="sm">
    {cart.lines.map((line) => <CartRow key={line.variantId} line={line} />)}
    <Text as="strong">{copy.subtotal}: {formatMoney(cart.subtotalMinor, cart.currency, locale)}</Text>
    <div className={classes("inline-row", "gap-xs", "wrap", "hor-right")}>
    {props.continueHref ? button({ children: copy.continue, href: props.continueHref, variant: "secondary" }) : null}
    {button({ children: copy.checkout, href: props.checkoutHref, variant: "primary" })}
    </div>
    </Stack>
  );
}

export { CartView };
