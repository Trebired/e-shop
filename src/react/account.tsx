import { button, input, Stack, Text } from "@trebired/frontend/react";
import { useCallback, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { formatMoney } from "./../money.js";
import type { Customer, Order } from "./../types.js";
import { storefrontRequest, type StorefrontError } from "./api.js";
import { classes } from "./classes.js";
import { useStorefront } from "./context.js";

type Account = { customer: Customer | null; orders: Order[] };
type Fields = Record<string, string>;

function useAccount() {
  const { basePath } = useStorefront();
  const [account, setAccount] = useState<Account | null>(null);
  const reload = useCallback(async () => {
      setAccount(await storefrontRequest<Account>(basePath, "/account").catch(() => ({ customer: null, orders: [] })));
    }, [basePath]);
  useEffect(() => {
      void reload();
    }, [reload]);
  return { account, reload };
}

function useForm(path: string, onDone: () => void) {
  const store = useStorefront();
  const [fields, setFields] = useState<Fields>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (extra: Fields = {}) => {
    setBusy(true);
    setMessage("");
    try {
      await storefrontRequest(store.basePath, path, { ...fields, ...extra });
      onDone();
    } catch (failure) {
      const code = (failure as StorefrontError).code;
      setMessage(store.copy.accountErrors[code] ?? store.copy.error);
    } finally {
      setBusy(false);
    }
  };
  const field = (name: string, label: string, type = "text") =>
  input({
      label,
      name,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setFields((current) => ({ ...current, [name]: event.target.value })),
      size: "sm",
      type,
      value: fields[name] ?? "",
  });
  return { busy, field, message, setMessage, submit };
}

function FormShell(props: { action: string; busy: boolean; children: ReactNode; message: string; onSubmit: () => void; title: string }) {
  return (
    <div className={classes("card", "column", "gap-xs")}>
    <Text as="strong">{props.title}</Text>
    {props.children}
    {props.message ? <Text muted>{props.message}</Text> : null}
    <div className={classes("inline-row", "hor-right")}>
    {button({ children: props.action, disabled: props.busy, onClick: props.onSubmit, variant: "primary" })}
    </div>
    </div>
  );
}

function LoginForm(props: { onDone: () => void }) {
  const { copy } = useStorefront();
  const form = useForm("/account/login", props.onDone);
  return (
    <FormShell action={copy.login} busy={form.busy} message={form.message} onSubmit={() => void form.submit()} title={copy.login}>
    {form.field("email", copy.email, "email")}
    {form.field("password", copy.password, "password")}
    </FormShell>
  );
}

function RegisterForm(props: { onDone: () => void }) {
  const { copy } = useStorefront();
  const form = useForm("/account/register", props.onDone);
  return (
    <FormShell action={copy.register} busy={form.busy} message={form.message} onSubmit={() => void form.submit()} title={copy.register}>
    {form.field("name", copy.name)}
    {form.field("email", copy.email, "email")}
    {form.field("password", copy.password, "password")}
    </FormShell>
  );
}

function ForgotPasswordForm() {
  const { copy } = useStorefront();
  const [sent, setSent] = useState(false);
  const form = useForm("/account/password/forgot", () => setSent(true));
  return (
    <FormShell
    action={copy.sendReset}
    busy={form.busy}
    message={sent ? copy.resetSent : form.message}
    onSubmit={() => void form.submit()}
    title={copy.forgot}
    >
    {form.field("email", copy.email, "email")}
    </FormShell>
  );
}

function ResetPasswordForm(props: { token: string }) {
  const { copy } = useStorefront();
  const [done, setDone] = useState(false);
  const form = useForm("/account/password/reset", () => setDone(true));
  if (done) return <Text>{copy.resetDone}</Text>;
  return (
    <FormShell
    action={copy.setPassword}
    busy={form.busy}
    message={form.message}
    onSubmit={() => void form.submit({ token: props.token })}
    title={copy.setPassword}
    >
    {form.field("password", copy.newPassword, "password")}
    </FormShell>
  );
}

function AccountView(props: { orderHref?: (order: Order) => string }) {
  const { basePath, copy, locale } = useStorefront();
  const { account, reload } = useAccount();
  if (!account) return null;
  if (!account.customer) {
    return (
      <div className={classes("grid", "auto-md", "gap-sm")}>
      <LoginForm onDone={() => void reload()} />
      <RegisterForm onDone={() => void reload()} />
      <ForgotPasswordForm />
      </div>
    );
  }
  const logout = async () => {
    await storefrontRequest(basePath, "/account/logout", {}).catch(() => undefined);
    await reload();
  };
  return (
    <Stack gap="sm">
    <div className={classes("inline-row", "gap-sm", "wrap", "ver-center")}>
    <Text>{copy.signedInAs.replace("{{name}}", account.customer.name)}</Text>
    {button({ children: copy.logout, onClick: () => void logout(), variant: "secondary" })}
    </div>
    <Text as="strong">{copy.myOrders}</Text>
    {account.orders.length ? null : <Text muted>{copy.noOrders}</Text>}
    {account.orders.map((order) => (
          <a
          className={classes("card", "inline-row", "gap-sm", "wrap", "ver-center")}
          href={props.orderHref?.(order) ?? `/order/${order.token}`}
          key={order.id}
          >
          <Text>{order.number}</Text>
          <Text muted>{new Date(order.createdAt).toLocaleDateString(locale)}</Text>
          <Text>{formatMoney(order.totals.totalMinor, order.currency, locale)}</Text>
          </a>
    ))}
    </Stack>
  );
}

export { AccountView, ForgotPasswordForm, LoginForm, RegisterForm, ResetPasswordForm, useAccount };
