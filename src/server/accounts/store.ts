import crypto from "node:crypto";
import type { Customer } from "./../../types.js";
import type { Db } from "./../db/database.js";
import { badRequest, conflict, EshopError } from "./../errors.js";
import { text } from "./../input.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200;
const SESSION_DAYS = 30;
const RESET_MINUTES = 60;
const UNIQUE_VIOLATION = "23505";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function emailOf(value: unknown): string {
  const email = text(value, "email", 254).toLowerCase();
  if (!EMAIL.test(email)) throw badRequest("eshop-email-invalid");
  return email;
}

function passwordOf(value: unknown): string {
  const password = String(value ?? "");
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) throw badRequest("eshop-password-weak", { min: MIN_PASSWORD });
  return password;
}

function toCustomer(row: any): Customer {
  return { createdAt: new Date(row.created_at).toISOString(), email: row.email, id: row.id, name: row.name };
}

async function createSession(db: Db, customerId: string): Promise<string> {
  const token = newToken();
  await db.exec("insert into eshop_customer_sessions (token_hash, customer_id, expires_at) values ($1, $2, now() + make_interval(days => $3))", [
      hashToken(token),
      customerId,
      SESSION_DAYS,
  ]);
  return token;
}

async function register(db: Db, input: any): Promise<{customer:Customer;token:string}> {
  const email = emailOf(input?.email);
  const name = text(input?.name, "name", 200);
  if (!name) throw badRequest("eshop-name-required");
  const hash = await Bun.password.hash(passwordOf(input?.password));
  try {
    const row = await db.one("insert into eshop_customers (email, name, password_hash) values ($1, $2, $3) returning *", [email, name, hash]);
    return { customer: toCustomer(row), token: await createSession(db, row.id) };
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw conflict("eshop-email-taken");
    throw error;
  }
}

async function login(db: Db, input: any): Promise<{customer:Customer;token:string}> {
  const email = emailOf(input?.email);
  const row = await db.one("select * from eshop_customers where email = $1", [email]);
  const valid = row ? await Bun.password.verify(String(input?.password ?? ""), row.password_hash) : false;
  if (!row || !valid) throw new EshopError(401, "eshop-login-invalid");
  return { customer: toCustomer(row), token: await createSession(db, row.id) };
}

async function sessionCustomer(db: Db, token: string): Promise<Customer|null> {
  if (!token) return null;
  const row = await db.one(
    `select c.* from eshop_customer_sessions s join eshop_customers c on c.id = s.customer_id
    where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  return row ? toCustomer(row) : null;
}

async function endSession(db: Db, token: string): Promise<void> {
  if (token) await db.exec("delete from eshop_customer_sessions where token_hash = $1", [hashToken(token)]);
}

async function startReset(db: Db, emailInput: unknown): Promise<{customer:Customer;token:string}|null> {
  const row = await db.one("select * from eshop_customers where email = $1", [emailOf(emailInput)]);
  if (!row) return null;
  const token = newToken();
  await db.exec("delete from eshop_password_resets where customer_id = $1", [row.id]);
  await db.exec("insert into eshop_password_resets (token_hash, customer_id, expires_at) values ($1, $2, now() + make_interval(mins => $3))", [
      hashToken(token),
      row.id,
      RESET_MINUTES,
  ]);
  return { customer: toCustomer(row), token };
}

async function finishReset(db: Db, input: any): Promise<string> {
  const password = passwordOf(input?.password);
  const hash = await Bun.password.hash(password);
  return await db.tx(async(tx) => {
      const reset = await tx.one<{customer_id:string}>(
        "delete from eshop_password_resets where token_hash = $1 and expires_at > now() returning customer_id",
        [hashToken(String(input?.token ?? ""))],
      );
      if (!reset) throw badRequest("eshop-reset-invalid");
      await tx.exec("update eshop_customers set password_hash = $2 where id = $1", [reset.customer_id, hash]);
      await tx.exec("delete from eshop_customer_sessions where customer_id = $1", [reset.customer_id]);
      const owner = await tx.one<{email:string}>("select email from eshop_customers where id = $1", [reset.customer_id]);
      return owner?.email ?? "";
  });
}

export { endSession, finishReset, login, register, sessionCustomer, startReset, toCustomer, SESSION_DAYS };
