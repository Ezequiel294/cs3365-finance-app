/** Display helpers usable from server and client components. */
export { formatBps, formatMoney, formatWholeDollars } from '@/shared/money';
export { formatAge, formatDateTime, formatDay, formatMonth, formatMonthShort, formatWeekdayDay } from '@/shared/dates';

export const DEFAULT_TIME_ZONE = 'America/Costa_Rica';

/** Today (yyyy-mm-dd) in a time zone. */
export function todayIn(timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "12.34" → 1234 cents; "14,000" → 1400000; returns null when not a positive amount. */
export function parseAmountInput(text: string): number | null {
  const s = text.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const m = /^(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]!.replace(/,/g, ''));
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  const cents = whole * 100 + frac;
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

/** Cents → "12.34" for an input's value. */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
}

/** Units → micro units ("0.6533" → 653300). */
export function parseQuantityInput(text: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!m) return null;
  const micro = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0') || 0);
  return micro > 0 && Number.isSafeInteger(micro) ? micro : null;
}

/** Micro units → "0.6533". */
export function formatQuantity(micro: number): string {
  const whole = Math.floor(micro / 1_000_000);
  const frac = String(micro % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
}

/** "CR94010200007052369668" → "CR94 0102 0000 7052 3696 68". */
export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
