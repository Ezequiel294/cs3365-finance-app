import { formatBps, formatMoney } from '../format';
import { SERIES_VAR } from './ChartFrame';

export interface Segment {
  label: string;
  valueCents: number;
  seriesSlot: number;
  detail?: string;
}

/**
 * One whole split into at most six parts with 2 px gaps. `tall`: 28 px with the share inside
 * wide enough blocks and a legend; `thin`: 8 px, no text. Drawn only with two parts above zero.
 */
export function SegmentedBar({ parts, variant = 'tall', showLegend = true }: { parts: Segment[]; variant?: 'tall' | 'thin'; showLegend?: boolean }) {
  const visible = parts.filter((p) => p.valueCents > 0);
  const total = visible.reduce((s, p) => s + p.valueCents, 0);
  if (visible.length < 2 || total <= 0) return null;
  const share = (v: number) => Math.round((v * 10000) / total);
  return (
    <div className="flex flex-col gap-3">
      <div className={variant === 'tall' ? 'flex h-7 w-full gap-[2px]' : 'flex h-2 w-full gap-[2px]'} aria-hidden="true">
        {visible.map((p, i) => {
          const bps = share(p.valueCents);
          const radius =
            variant === 'thin'
              ? i === 0
                ? '999px 0 0 999px'
                : i === visible.length - 1
                  ? '0 999px 999px 0'
                  : '0'
              : i === 0
                ? '4px 0 0 4px'
                : i === visible.length - 1
                  ? '0 4px 4px 0'
                  : '0';
          return (
            <div
              key={p.label}
              className="flex min-w-[2px] items-center justify-center overflow-hidden text-[13px] font-semibold"
              style={{
                width: `${bps / 100}%`,
                background: SERIES_VAR(p.seriesSlot),
                borderRadius: radius,
                color: p.seriesSlot === 4 ? 'var(--color-text)' : '#fff',
              }}
              title={`${p.label}: ${formatMoney(p.valueCents)}, ${formatBps(bps)}`}
            >
              {variant === 'tall' && bps >= 1200 ? formatBps(Math.round(bps / 100) * 100) : null}
            </div>
          );
        })}
      </div>
      {variant === 'tall' && showLegend ? (
        <ul className="flex flex-col gap-1 text-sm">
          {visible.map((p) => (
            <li key={p.label} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-[3px]" style={{ background: SERIES_VAR(p.seriesSlot) }} />
                <span className="truncate">
                  {p.label}
                  {p.detail ? <span className="text-text-secondary"> · {p.detail}</span> : null}
                </span>
              </span>
              <span className="tabular whitespace-nowrap">
                {formatMoney(p.valueCents)} <span className="text-text-secondary">· {formatBps(Math.round(share(p.valueCents) / 100) * 100)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
