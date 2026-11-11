import QRCode from "qrcode";
import type { NormalizedEshopConfig } from "./../config/types.js";
import type { PaymentInstructions, PaymentMethodKind } from "./../types.js";
import { badRequest } from "./errors.js";

const DAY_MS = 86400000;
const SPAYD_MESSAGE_MAX = 60;

function spaydMessage(text: string): string {
  return text
  .normalize("NFKD")
  .replace(/[̀-ͯ]/gu, "")
  .replace(/[*]/gu, " ")
  .slice(0, SPAYD_MESSAGE_MAX)
  .trim();
}

function spaydString(input: { amountMinor: number; currency: string; iban: string; message: string; variableSymbol: string }): string {
  const parts = [
    "SPD*1.0",
    `ACC:${input.iban}`,
    `AM:${(input.amountMinor / 100).toFixed(2)}`,
    `CC:${input.currency}`,
    `X-VS:${input.variableSymbol}`,
  ];
  const message = spaydMessage(input.message);
  if (message) parts.push(`MSG:${message}`);
  return parts.join("*");
}

async function bankTransferInstructions(config: NormalizedEshopConfig, order: { number: string; totalMinor: number }): Promise<PaymentInstructions> {
  const bank = config.payments.bankTransfer;
  if (!bank) throw badRequest("eshop-payment-unavailable");
  const variableSymbol = order.number.replace(/\D/gu, "").slice(-10);
  const spayd = spaydString({
      amountMinor: order.totalMinor,
      currency: config.shop.currency,
      iban: bank.iban,
      message: bank.message || `${config.shop.name} ${order.number}`,
      variableSymbol,
  });
  return {
    accountName: bank.accountName,
    amountMinor: order.totalMinor,
    dueDate: new Date(Date.now() + bank.dueDays * DAY_MS).toISOString().slice(0, 10),
    iban: bank.iban,
    qrSvg: await QRCode.toString(spayd, { errorCorrectionLevel: "M", margin: 1, type: "svg" }),
    variableSymbol,
  };
}

function availablePaymentMethods(config: NormalizedEshopConfig): PaymentMethodKind[] {
  const payments = config.payments;
  const enabled: [PaymentMethodKind, boolean][] = [
    ["bank_transfer", Boolean(payments.bankTransfer)],
    ["stripe", Boolean(payments.stripe)],
    ["gopay", Boolean(payments.gopay)],
    ["comgate", Boolean(payments.comgate)],
    ["btcpay", Boolean(payments.btcpay)],
  ];
  return enabled.filter(([, on]) => on).map(([kind]) => kind);
}

export { availablePaymentMethods, bankTransferInstructions, spaydString };
