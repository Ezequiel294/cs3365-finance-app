import Link from 'next/link';
import { addMonths } from '@/shared/dates';
import { cx, formatMonth } from './format';

/**
 * "‹ Oct 2026 ›". The month is in the URL (?month=2026-10). The next arrow is disabled on
 * the current month.
 */
export function MonthPicker({
  month,
  currentMonth,
  basePath,
  params = {},
}: {
  month: string;
  currentMonth: string;
  latestMonthWithData?: string | null;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (m: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set('month', m);
    return `${basePath}?${q.toString()}`;
  };
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const nextDisabled = month >= currentMonth;
  const arrow = 'inline-flex h-11 w-11 items-center justify-center rounded-[6px] border border-border bg-surface text-base sm:h-9 sm:w-9';
  return (
    <div className="flex items-center gap-2" aria-label="Month">
      <Link href={href(prev)} className={arrow} aria-label={`Previous month, ${formatMonth(prev)}`}>
        ‹
      </Link>
      <span className="min-w-[88px] text-center text-sm font-medium tabular" aria-live="polite">
        {formatMonth(month)}
      </span>
      {nextDisabled ? (
        <span className={cx(arrow, 'cursor-not-allowed text-axis')} aria-disabled="true" aria-label="Next month">
          ›
        </span>
      ) : (
        <Link href={href(next)} className={arrow} aria-label={`Next month, ${formatMonth(next)}`}>
          ›
        </Link>
      )}
    </div>
  );
}
