/** Calendar arithmetic on `yyyy-mm-dd` strings, in UTC so no time zone shifts the date. */

export function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function addMonths(date: string, months: number): string {
  const d = toUtc(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return fromUtc(d);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Inclusive list of months `yyyy-mm` from `from` to `to`. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = `${from}-01`;
  const end = `${to}-01`;
  while (cur <= end && out.length < 240) {
    out.push(cur.slice(0, 7));
    cur = addMonths(cur, 1);
  }
  return out;
}

export function lastDayOfMonth(month: string): string {
  return addDays(addMonths(`${month}-01`, 1), -1);
}

/** Every date from `from` to `to`, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let cur = from; cur <= to && out.length < 4000; cur = addDays(cur, 1)) out.push(cur);
  return out;
}
