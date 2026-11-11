import { classes } from "./classes.js";
import { button, Stack, Text } from "@trebired/frontend/react";
import { useEffect, useState } from "react";
import { storefrontRequest } from "./api.js";
import { formatMoney, localized } from "./../money.js";
import type { Order } from "./../types.js";
import { useStorefront } from "./context.js";
import { useOrder } from "./hooks.js";

function BankTransfer(props: { order: Order }) {
  const { copy, locale } = useStorefront();
  const pay = props.order.payment.instructions;
  if (!pay || props.order.payment.status !== "pending") return null;
  return (
    <div className={classes("card", "inline-row", "gap-sm", "wrap")}>
    <img alt="" className={classes("width-xs")} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(pay.qrSvg)}`} />
    <Stack gap="xs2">
    <Text>{copy.pay}</Text>
    <Text>{copy.iban}: {pay.iban}</Text>
    {pay.accountName ? <Text>{copy.accountName}: {pay.accountName}</Text> : null}
    <Text>{copy.variableSymbol}: {pay.variableSymbol}</Text>
    <Text>{copy.total}: {formatMoney(pay.amountMinor, props.order.currency, locale)}</Text>
    <Text>{copy.dueDate}: {pay.dueDate}</Text>
    </Stack>
    </div>
  );
}

function OnlinePayment(props: { order: Order }) {
  const { basePath, copy } = useStorefront();
  const [order, setOrder] = useState(props.order);
  const [busy, setBusy] = useState(false);
  const path = `/orders/${encodeURIComponent(order.token)}`;
  useEffect(() => {
      if (order.payment.reference && order.status === "pending_payment") {
        void storefrontRequest<{ order: Order }>(basePath, `${path}/refresh`, {}).then((out) => setOrder(out.order)).catch(() => undefined);
      }
    }, []);
  if (order.payment.method === "bank_transfer" || order.status !== "pending_payment") return null;
  const pay = async() => {
    setBusy(true);
    const out = await storefrontRequest<{ order: Order }>(basePath, `${path}/pay`, {}).catch(() => null);
    if (out?.order.payment.redirectUrl) window.location.assign(out.order.payment.redirectUrl);
    else setBusy(false);
  };
  return (
    <div className={classes("inline-row", "gap-sm", "wrap", "ver-center")}>
    <Text muted>{order.payment.status === "failed" ? copy.paymentFailed : copy.paymentWaiting}</Text>
    {button({ children: copy.payOnline, disabled: busy, onClick: () => void pay(), variant: "primary" })}
    </div>
  );
}

function OrderSummary(props: { order: Order }) {
  const { copy, locale } = useStorefront();
  const { order } = props;
  const money = (minor: number) => formatMoney(minor, order.currency, locale);
  return (
    <Stack gap="xs">
    <Text as="strong">{copy.orderPlaced.replace("{{number}}", order.number)}</Text>
    <Text muted>{copy.status}: {order.status}</Text>
    {order.lines.map((line) => (
          <Text key={line.sku}>{line.quantity} × {localized(line.name, locale)} {localized(line.variantName, locale)}: {money(line.totalMinor)}</Text>
    ))}
    <Text>{copy.shipping}: {localized(
        order.shipping.label,
        locale
    )} ({order.shipping.priceMinor ? money(order.shipping.priceMinor) : copy.free})</Text>
    {order.shipping.pickupPoint ? <Text>{copy.pickupPoint}: {order.shipping.pickupPoint.name}</Text> : null}
    {order.shipping.packet ? (
        <a href={order.shipping.packet.trackingUrl} rel="noopener noreferrer" target="_blank">{copy.track}</a>
      ) : null}
    <Text as="strong">{copy.total}: {money(order.totals.totalMinor)}</Text>
    <BankTransfer order={order} />
    <OnlinePayment order={order} />
    </Stack>
  );
}

function OrderStatus(props: { token: string }) {
  const { copy } = useStorefront();
  const loaded = useOrder(props.token);
  if (loaded.error) return <Text muted>{copy.error}</Text>;
  return loaded.data ? <OrderSummary order={loaded.data.order} /> : null;
}

export { OrderStatus, OrderSummary };
