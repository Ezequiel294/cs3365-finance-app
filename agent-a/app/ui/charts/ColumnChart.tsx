import { formatMoney, formatMonthShort, formatWholeDollars } from '../format';
import { SERIES_VAR } from './ChartFrame';
import { bandPositions, linear, niceTicks, topRoundedRect } from './scale';

export interface ColumnSeries {
  label: string;
  seriesSlot: number;
  valuesCents: number[];
}

const W = 640;
const H = 240;
const M = { top: 20, right: 8, bottom: 40, left: 56 };

/**
 * Months on the x axis, one group of columns per month. The y axis starts at 0 with four
 * nice ticks. A zero value draws no column and prints "$0" on the baseline. Only the
 * latest month's columns carry a value label.
 */
export function ColumnChart({ months, series }: { months: string[]; series: ColumnSeries[] }) {
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const max = Math.max(0, ...series.flatMap((s) => s.valuesCents));
  const ticks = niceTicks(max / 100, 4).map((t) => t * 100);
  const top = ticks[ticks.length - 1] || 1;
  const y = linear(top, plotH);
  const bands = bandPositions(months.length, plotW);
  const band = months.length ? plotW / months.length : plotW;
  const gap = 2;
  const colW = Math.min(24, Math.max(4, (band * 0.7 - gap * (series.length - 1)) / Math.max(1, series.length)));
  const groupW = colW * series.length + gap * (series.length - 1);
  const last = months.length - 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ width: "100%", height: "auto", maxHeight: H }} className="block overflow-visible">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={M.top + plotH - y(t)} y2={M.top + plotH - y(t)} stroke="var(--color-border)" strokeWidth={1} />
          <text x={M.left - 8} y={M.top + plotH - y(t) + 4} textAnchor="end" fontSize={12} fill="var(--color-text-secondary)" className="tabular">
            {formatWholeDollars(t)}
          </text>
        </g>
      ))}
      <line x1={M.left} x2={W - M.right} y1={M.top + plotH} y2={M.top + plotH} stroke="var(--color-axis)" strokeWidth={1} />
      {months.map((m, i) => {
        const gx = M.left + bands[i]! + (band - groupW) / 2;
        const showYear = i === 0 || m.endsWith('-01');
        return (
          <g key={m}>
            {series.map((s, j) => {
              const v = s.valuesCents[i] ?? 0;
              const x = gx + j * (colW + gap);
              const h = y(v);
              const yTop = M.top + plotH - h;
              return (
                <g key={s.label}>
                  {v > 0 ? (
                    <path d={topRoundedRect(x, yTop, colW, h)} fill={SERIES_VAR(s.seriesSlot)}>
                      <title>{`${s.label}, ${formatMonthShort(m)} ${m.slice(0, 4)}: ${formatMoney(v)}`}</title>
                    </path>
                  ) : (
                    <text x={x + colW / 2} y={M.top + plotH - 4} textAnchor="middle" fontSize={11} fill="var(--color-text-secondary)">
                      $0
                    </text>
                  )}
                  {i === last && v > 0 ? (
                    <text x={x + colW / 2} y={yTop - 6} textAnchor="middle" fontSize={11} fill="var(--color-text)" className="tabular">
                      {formatWholeDollars(v)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <text x={M.left + bands[i]! + band / 2} y={M.top + plotH + 16} textAnchor="middle" fontSize={12} fill="var(--color-text-secondary)">
              {formatMonthShort(m)}
            </text>
            {showYear ? (
              <text x={M.left + bands[i]! + band / 2} y={M.top + plotH + 32} textAnchor="middle" fontSize={11} fill="var(--color-text-secondary)">
                {m.slice(0, 4)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
