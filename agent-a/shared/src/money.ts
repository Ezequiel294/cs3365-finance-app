import type { Currency } from "./enums";

const SYMBOL: Record<Currency, string> = { USD: "$", CRC: "₡" };

/** Formats integer minor units in their own currency, e.g. 1400000 CRC → "₡14,000.00". */
export function formatMinor(amountMinor: number, currency: Currency): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(Math.trunc(amountMinor));
  const units = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = units.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${SYMBOL[currency]}${grouped}.${cents.toString().padStart(2, "0")}`;
}

export function formatUsd(cents: number): string {
  return formatMinor(cents, "USD");
}

/** Parses a user-typed decimal amount ("1,234.56" or "14000") into integer minor units without floating point. */
export function parseDecimalToMinor(text: string): number | null {
  const cleaned = text.replace(/[\s,₡$]/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const units = Number(m[1]);
  const cents = Number((m[2] ?? "").padEnd(2, "0"));
  const value = units * 100 + cents;
  return Number.isSafeInteger(value) ? value : null;
}

/** Parses a decimal quantity ("3.2155") into millionths of a unit. */
export function parseQuantityToMicro(text: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!m) return null;
  const value = Number(m[1]) * 1_000_000 + Number((m[2] ?? "").padEnd(6, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

export function formatQuantity(quantityMicro: number): string {
  const units = Math.floor(quantityMicro / 1_000_000);
  const frac = (quantityMicro % 1_000_000).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${units}.${frac}` : `${units}`;
}
