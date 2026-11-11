import { button, input, Stack, Text, textarea } from "@trebired/frontend/react";
import { useEffect, useState, type ChangeEvent } from "react";
import { formatMoney, localized } from "./../money.js";
import type { Order } from "./../types.js";
import { storefrontRequest, type StorefrontError } from "./api.js";
import { classes } from "./classes.js";
import { useStorefront } from "./context.js";

type Options = { payments: string[]; shipping: { id: string; label: Record<string, string>; priceMinor: number }[] };
type Form = Record<"city" | "email" | "name" | "note" | "phone" | "postalCode" | "street", string>;

const EMPTY: Form = { city: "", email: "", name: "", note: "", phone: "", postalCode: "", street: "" };

function Field(props: { form: Form; label: string; name: keyof Form; set: (name: keyof Form, value: string) => void; type?: string }) {
  return input({
      label: props.label,
      name: props.name,
      onChange: (event: ChangeEvent<HTMLInputElement>) => props.set(props.name, event.target.value),
      size: "sm",
      type: props.type ?? "text",
      value: props.form[props.name],
  });
}

function Choices(props: { items: { id: string; label: string }[]; onPick: (id: string) => void; title: string; value: string }) {
  return (
    <Stack gap="xs">
    <Text as="strong">{props.title}</Text>
    <div className={classes("inline-row", "gap-xs", "wrap")}>
    {props.items.map((item) =>
        button({ active: item.id === props.value, children: item.label, key: item.id, onClick: () => props.onPick(item.id), variant: "secondary" }),
    )}
    </div>
    </Stack>
  );
}

function useCheckout(onPlaced: (order: Order) => void) {
  const store = useStorefront();
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [shipping, setShipping] = useState("");
  const [payment, setPayment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
      storefrontRequest<Options>(store.basePath, "/checkout/options").then((next) => {
          setOptions(next);
          setShipping(next.shipping[0]?.id ?? "");
          setPayment(next.payments[0] ?? "");
      }).catch (() => setError(store.copy.error));
    }, [store.basePath, store.cart?.subtotalMinor]);
  const place = async () => {
    setBusy(true);
    setError("");
    try {
      const address = { city: form.city, country: "CZ", name: form.name, postalCode: form.postalCode, street: form.street };
      const body = {
        billingAddress: address,
        contact: { email: form.email, name: form.name, phone: form.phone },
        locale: store.locale,
        note: form.note,
        paymentMethod: payment,
        shippingMethodId: shipping,
      };
      const result = await storefrontRequest<{ order: Order }>(store.basePath, "/checkout", body);
      await store.refreshCart();
      onPlaced(result.order);
    } catch (failure) {
      setError((failure as StorefrontError).code || store.copy.error);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, form, options, payment, place, set: (
      name: keyof Form,
      value: string
    ) => setForm((current) => ({ ...current, [name]: value })), setPayment, setShipping, shipping, store };
}

function CheckoutForm(props: { onPlaced: (order: Order) => void; paymentLabels?: Record<string, string> }) {
  const checkout = useCheckout(props.onPlaced);
  const { copy, locale, cart } = checkout.store;
  if (!cart || !checkout.options) return null;
  if (!cart.lines.length) return <Text muted>{copy.empty}</Text>;
  const money = (minor: number) => (minor ? formatMoney(minor, cart.currency, locale) : copy.free);
  const shippingItems = checkout.options.shipping.map((option) => ({
        id: option.id,
        label: `${localized(option.label, locale)} (${money(option.priceMinor)})`,
  }));
  const paymentItems = checkout.options.payments.map((id) => ({ id, label: props.paymentLabels?.[id] ?? id }));
  return (
    <Stack gap="sm">
    <Field form={checkout.form} label={copy.email} name="email" set={checkout.set} type="email" />
    <Field form={checkout.form} label={copy.name} name="name" set={checkout.set} />
    <Field form={checkout.form} label={copy.phone} name="phone" set={checkout.set} type="tel" />
    <Text as="strong">{copy.address}</Text>
    <Field form={checkout.form} label={copy.street} name="street" set={checkout.set} />
    <Field form={checkout.form} label={copy.city} name="city" set={checkout.set} />
    <Field form={checkout.form} label={copy.postalCode} name="postalCode" set={checkout.set} />
    <Choices items={shippingItems} onPick={checkout.setShipping} title={copy.shipping} value={checkout.shipping} />
    <Choices items={paymentItems} onPick={checkout.setPayment} title={copy.payment} value={checkout.payment} />
    {textarea({
          label: copy.note,
          onChange: (event: ChangeEvent<HTMLTextAreaElement>) => checkout.set("note", event.target.value),
          rows: 3,
          value: checkout.form.note,
    })}
    {checkout.error ? <Text muted>{checkout.error}</Text> : null}
    <div className={classes("inline-row", "hor-right")}>
    {button({ children: copy.placeOrder, disabled: checkout.busy, onClick: () => void checkout.place(), variant: "primary" })}
    </div>
    </Stack>
  );
}

export { CheckoutForm };
