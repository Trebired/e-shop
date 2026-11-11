import crypto from "node:crypto";
import { SIGNATURE_WINDOW_MS } from "./../constants.js";

function bodyHash(body: Buffer | string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}

function signRequest(token: string, input: { body: Buffer | string; method: string; path: string; timestamp: number }): string {
  const payload = `${input.timestamp}.${input.method.toUpperCase()}.${input.path}.${bodyHash(input.body)}`;
  return crypto.createHmac("sha256", token).update(payload).digest("hex");
}

function verifySignature(token: string, input: {
    body: Buffer | string;
    method: string;
    path: string;
    signature: string;
    timestamp: string
}): boolean {
  const timestamp = Number(input.timestamp);
  if (!token || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > SIGNATURE_WINDOW_MS) return false;
  const expected = Buffer.from(signRequest(token, { ...input, timestamp }), "hex");
  const given = Buffer.from(String(input.signature || ""), "hex");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export { bodyHash, signRequest, verifySignature };
