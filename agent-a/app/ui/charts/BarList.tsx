import { Disclosure } from '../Disclosure';
import { cx, formatBps, formatMoney } from '../format';
import { linear } from './scale';

export interface BarRow {
  key: string;
  label: string;
  valueCents: number;
  shareBps?: number | null;
  markerCents?: number | null;
  markerLabel?: string;
  muted?: boolean;
  right?: React.ReactNode;
}

/**
 * Ranked rows on a CSS grid: label, bar, share, amount. One hue (the rows are ranked, not
 * different series); muted rows last in the axis colour. Only maxRows are shown; the rest
 * are summed in one line that opens them.
 */
export function BarList({
  rows,
  maxRows = 6,
  tailLabel = (n: number, cents: number) => `${n} smaller categories · ${formatMoney(cents)}`,
}: {
  rows: BarRow[];
  maxRows?: number;
  tailLabel?: (count: number, cents: number) => string;
}) {
  const sorted = [...rows].sort((a, b) => Number(Boolean(a.muted)) - Number(Boolean(b.muted)) || b.valueCents - a.valueCents);
  const ranked = sorted.filter((r) => !r.muted);
  const muted = sorted.filter((r) => r.muted);
  const shownRanked = ranked.slice(0, maxRows);
  const tail = ranked.slice(maxRows);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.valueCents, r.markerCents ?? 0)));
  const scale = linear(max, 100);

  const renderRow = (r: BarRow) => (
    <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(6rem,30%)_minmax(40%,1fr)_auto]">
      <div className="min-w-0">
        <div className={cx('truncate text-sm', r.muted && 'text-text-secondary')} title={r.label}>
          {r.label}
        </div>
        {r.markerLabel ? <div className="text-[13px] text-text-secondary">{r.markerLabel}</div> : null}
      </div>
      <div className="relative col-span-2 h-3 sm:col-span-1 sm:row-start-1 sm:col-start-2" aria-hidden="true">
        <div
          className="absolute inset-y-0 left-0 rounded-r-[4px]"
          style={{ width: `${scale(r.valueCents)}%`, background: r.muted ? 'var(--color-axis)' : 'var(--color-series-1)' }}
          title={`${r.label}: ${formatMoney(r.valueCents)}${r.shareBps != null ? `, ${formatBps(r.shareBps)}` : ''}`}
        />
        {r.markerCents != null ? (
          <div className="absolute -inset-y-1 w-[2px] bg-text" style={{ left: `calc(${scale(r.markerCents)}% - 1px)` }} title={r.markerLabel} />
        ) : null}
      </div>
      <div className="row-start-1 col-start-2 flex items-baseline justify-end gap-3 text-sm tabular whitespace-nowrap sm:col-start-3">
        {r.shareBps != null ? <span className="text-text-secondary">{formatBps(Math.round(r.shareBps / 100) * 100)}</span> : null}
        {r.right ?? <span>{formatMoney(r.valueCents)}</span>}
      </div>
    </li>
  );

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">{shownRanked.map(renderRow)}</ul>
      {tail.length ? (
        <Disclosure summary={tailLabel(tail.length, tail.reduce((s, r) => s + r.valueCents, 0))}>
          <ul className="flex flex-col gap-3">{tail.map(renderRow)}</ul>
        </Disclosure>
      ) : null}
      {muted.length ? <ul className="flex flex-col gap-3">{muted.map(renderRow)}</ul> : null}
    </div>
  );
}
