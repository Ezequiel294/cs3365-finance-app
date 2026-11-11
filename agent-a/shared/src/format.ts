import type { Currency } from './types';

const SYMBOL: Record<Currency, string> = { USD: '$', CRC: '₡' };

/** Formats integer minor units in their own currency, e.g. 1400000 CRC → "₡14,000.00". */
export function formatMinor(amountMinor: number, currency: Currency): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const cents = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${SYMBOL[currency]}${whole}.${cents}`;
}

/** Formats USD cents, e.g. 2740 → "$27.40". */
export function formatUsd(cents: number): string {
  return formatMinor(cents, 'USD');
}

/** Parses a user-typed amount ("1,234.56", "12") into integer minor units. */
export function parseAmountInput(text: string): number | null {
  const s = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [int, frac = ''] = s.split('.');
  return Number(int) * 100 + Number(frac.padEnd(2, '0'));
}

/** Parses a user-typed quantity ("0.6533") into millionths of a unit. */
export function parseQuantityInput(text: string): number | null {
  const s = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{0,6})?$/.test(s)) return null;
  const [int, frac = ''] = s.split('.');
  return Number(int) * 1_000_000 + Number(frac.padEnd(6, '0'));
}

/** Formats millionths of a unit, trimming trailing zeros: 653300 → "0.6533". */
export function formatQuantity(quantityMicro: number): string {
  const whole = Math.floor(quantityMicro / 1_000_000);
  const frac = String(quantityMicro % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

/** Today's date in a time zone, as yyyy-mm-dd. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const DEFAULT_TIME_ZONE = 'America/Costa_Rica';
