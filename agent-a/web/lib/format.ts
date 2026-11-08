import { formatMinor, formatUsd, type Transaction } from "@finance/shared";

export { formatMinor, formatUsd };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthName(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function shortDate(date: string): string {
  return `${SHORT[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

export function shortMonth(month: string): string {
  return `${SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** "₡14,000.00 ($27.40 at 510.95 on Oct 14)" or "$12.00": the original amount first, then USD and the rate. */
export function originalWithUsd(t: Pick<Transaction, "currency" | "amountMinor" | "amountUsdCents" | "fxRate" | "fxDate">): { original: string; converted?: string } {
  const original = formatMinor(t.amountMinor, t.currency);
  if (t.currency === "USD") return { original };
  return { original, converted: `${formatUsd(t.amountUsdCents)} at ${t.fxRate} on ${shortDate(t.fxDate)}` };
}

export function addMonths(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}

/** Today in Costa Rica time (the default profile time zone) as yyyy-mm-dd. */
export function todayIn(timeZone = "America/Costa_Rica"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function ago(iso: string | undefined): string {
  if (!iso) return "never";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function timeOf(iso: string, timeZone = "America/Costa_Rica"): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
