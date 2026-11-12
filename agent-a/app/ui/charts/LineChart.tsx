import { formatDay, formatWholeDollars } from '../format';
import { linear, niceTicks } from './scale';

export interface LineSeries {
  label: string;
  valuesCents: number[];
  context?: boolean;
}

export interface ReferenceLine {
  label: string;
  valueCents: number;
}

const W = 640;
const H = 220;
const M = { top: 24, right: 72, bottom: 28, left: 56 };

/**
 * Days from the period start to its end, labelled at the start, today, and the end. The main
 * series ends today in a dot labelled "Spent $136"; a context series (the even pace) is in
 * the axis colour; the limit is a thin line labelled above its right end.
 */
export function LineChart({ dates, series, limit, today }: { dates: string[]; series: LineSeries[]; limit?: ReferenceLine; today?: string }) {
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const max = Math.max(limit?.valueCents ?? 0, ...series.flatMap((s) => s.valuesCents), 1);
  const ticks = niceTicks(max / 100, 4).map((t) => t * 100);
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => M.top + plotH - linear(top, plotH)(v);
  const n = Math.max(1, dates.length - 1);
  const x = (i: number) => M.left + (i / n) * plotW;
  const pathFor = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const year = new Date().getUTCFullYear();
  const todayIdx = today ? dates.indexOf(today) : -1;
  const labelIdx = [...new Set([0, todayIdx, dates.length - 1].filter((i) => i >= 0))];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ width: "100%", height: "auto", maxHeight: H }} className="block overflow-visible">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
          <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--color-text-secondary)" className="tabular">
            {formatWholeDollars(t)}
          </text>
        </g>
      ))}
      {labelIdx.map((i) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'} fontSize={12} fill="var(--color-text-secondary)">
          {formatDay(dates[i]!, year)}
        </text>
      ))}
      {limit ? (
        <g>
          <line x1={M.left} x2={M.left + plotW} y1={y(limit.valueCents)} y2={y(limit.valueCents)} stroke="var(--color-text-secondary)" strokeWidth={1} />
          <text x={M.left + plotW} y={y(limit.valueCents) - 6} textAnchor="end" fontSize={12} fill="var(--color-text)">
            {limit.label}
          </text>
        </g>
      ) : null}
      {series.map((s) => {
        if (!s.valuesCents.length) return null;
        const lastI = s.valuesCents.length - 1;
        const lastV = s.valuesCents[lastI]!;
        return (
          <g key={s.label}>
            <path d={pathFor(s.valuesCents)} fill="none" stroke={s.context ? 'var(--color-axis)' : 'var(--color-series-1)'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
              <title>{s.label}</title>
            </path>
            {s.context ? (
              <text x={x(lastI) + 6} y={y(lastV) + 4} fontSize={12} fill="var(--color-text-secondary)">
                Even pace
              </text>
            ) : (
              <g>
                <circle cx={x(lastI)} cy={y(lastV)} r={5} fill="var(--color-series-1)" stroke="var(--color-surface)" strokeWidth={2}>
                  <title>{`Spent ${formatWholeDollars(lastV)} by ${formatDay(dates[lastI]!, year)}`}</title>
                </circle>
                <text x={x(lastI) + 8} y={y(lastV) - 8} fontSize={12} fontWeight={600} fill="var(--color-text)">
                  {`Spent ${formatWholeDollars(lastV)}`}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
