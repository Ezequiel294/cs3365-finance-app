import 'server-only';
import { unstable_rethrow } from 'next/navigation';

/** Runs a loader for a page; API failures become a message instead of an error page. */
export async function safe<T>(promise: Promise<T>): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await promise, error: null };
  } catch (err) {
    unstable_rethrow(err);
    return { data: null, error: (err as Error).message || 'Could not load this data' };
  }
}

/** The month before `today`'s, as yyyy-mm (America/Costa_Rica). */
export function lastMonth(now = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit' }).format(now);
  const [y, m] = today.split('-').map(Number);
  const prev = m === 1 ? [y - 1, 12] : [y, m - 1];
  return `${prev[0]}-${String(prev[1]).padStart(2, '0')}`;
}

export function thisMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit' }).format(now);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Costa_Rica' });
}
