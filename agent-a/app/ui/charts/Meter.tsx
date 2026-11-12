import type { ReactNode } from 'react';

/**
 * A thin bar for one ratio against a limit. At or over the limit the fill turns critical and
 * the row gains a ▲. The figures are always printed beside it; the bar never carries the
 * number alone.
 */
export function Meter({
  valueCents,
  limitCents,
  markerCents,
  markerLabel,
  figures,
}: {
  valueCents: number;
  limitCents: number;
  markerCents?: number | null;
  markerLabel?: string;
  figures: ReactNode;
}) {
  const ratio = limitCents > 0 ? Math.min(Math.max(valueCents, 0) / limitCents, 1) : 0;
  const over = limitCents > 0 && valueCents >= limitCents;
  const marker = markerCents != null && limitCents > 0 ? Math.min(markerCents / limitCents, 1) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2 w-full rounded-full" style={{ background: 'var(--color-series-1-track)' }} aria-hidden="true">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${ratio * 100}%`, background: over ? 'var(--color-critical)' : 'var(--color-series-1)' }}
        />
        {marker !== null ? (
          <div className="absolute -inset-y-1 w-[2px] bg-text" style={{ left: `calc(${marker * 100}% - 1px)` }} title={markerLabel} />
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 text-sm tabular">
        {over ? (
          <span aria-hidden="true" className="text-critical">
            ▲
          </span>
        ) : null}
        <span>{figures}</span>
      </div>
    </div>
  );
}
