import type { ReactNode } from 'react';
import { type Column, DataTable, type Row } from '../DataTable';
import { Disclosure } from '../Disclosure';

export interface LegendItem {
  label: string;
  seriesSlot: number;
}

export interface TableData {
  columns: Column[];
  rows: Row[];
}

export const SERIES_VAR = (slot: number) => (slot > 0 ? `var(--color-series-${slot})` : 'var(--color-axis)');

/**
 * Wraps every chart: an h3 title, a one-sentence summary that states the answer, the legend
 * (only for two or more series), the chart, and "Show as table" with the same numbers. With
 * fewer points than minPoints it shows the notEnoughData sentence and the table instead.
 */
export function ChartFrame({
  title,
  summary,
  legend = [],
  table,
  points,
  minPoints = 0,
  notEnoughData,
  children,
}: {
  title: string;
  summary: string;
  legend?: LegendItem[];
  table?: TableData;
  points?: number;
  minPoints?: number;
  notEnoughData?: string;
  children: ReactNode;
}) {
  const tooFew = points !== undefined && points < minPoints;
  return (
    <figure className="m-0 flex flex-col gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm">{tooFew && notEnoughData ? notEnoughData : summary}</p>
      {!tooFew && legend.length >= 2 ? (
        <ul className="flex flex-wrap gap-4 text-[13px]" aria-label="Legend">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px]" style={{ background: SERIES_VAR(l.seriesSlot) }} />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
      {tooFew ? null : <div role="img" aria-label={summary}>{children}</div>}
      {table ? (
        tooFew ? (
          <DataTable columns={table.columns} rows={table.rows} caption={title} />
        ) : (
          <Disclosure summary="Show as table">
            <DataTable columns={table.columns} rows={table.rows} caption={title} />
          </Disclosure>
        )
      ) : null}
    </figure>
  );
}
