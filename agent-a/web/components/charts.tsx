import { formatUsd, type BurndownSeries, type MonthTotal } from "@finance/shared";
import { shortDate, shortMonth } from "@/lib/format";

const W = 720;
const H = 260;
const PAD = { left: 64, right: 16, top: 16, bottom: 36 };

function scale(max: number) {
  const inner = H - PAD.top - PAD.bottom;
  return (v: number) => PAD.top + inner - (max > 0 ? (v / max) * inner : 0);
}

/** 04-S06: income and spending per month on one timeline; months with nothing read $0. */
export function CashflowChart({ months }: { months: MonthTotal[] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.incomeCents, m.expenseCents]));
  const y = scale(max);
  const slot = (W - PAD.left - PAD.right) / Math.max(1, months.length);
  const bar = Math.max(4, slot / 2 - 4);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Income and spending per month">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} stroke="#e2e6ec" />
          <text x={PAD.left - 6} y={y(max * f) + 4} fontSize="11" textAnchor="end" fill="#5d6878">
            {formatUsd(Math.round(max * f)).replace(/\.\d\d$/, "")}
          </text>
        </g>
      ))}
      {months.map((m, i) => {
        const x = PAD.left + i * slot + slot / 2;
        return (
          <g key={m.month}>
            <rect x={x - bar - 1} y={y(m.incomeCents)} width={bar} height={y(0) - y(m.incomeCents)} fill="#1a7f37">
              <title>{`${shortMonth(m.month)} income ${formatUsd(m.incomeCents)}`}</title>
            </rect>
            <rect x={x + 1} y={y(m.expenseCents)} width={bar} height={y(0) - y(m.expenseCents)} fill="#cf222e">
              <title>{`${shortMonth(m.month)} spending ${formatUsd(m.expenseCents)}`}</title>
            </rect>
            <text x={x} y={H - 14} fontSize="11" textAnchor="middle" fill="#5d6878">
              {shortMonth(m.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 03-S11: cumulative spending per day against the even-pace line. */
export function BurndownChart({ series }: { series: BurndownSeries }) {
  const n = series.dates.length;
  const max = Math.max(1, series.limitCents, ...series.cumulativeSpentCents);
  const y = scale(max);
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.left - PAD.right));
  const line = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Spending so far against the even pace line">
      <line x1={PAD.left} x2={W - PAD.right} y1={y(series.limitCents)} y2={y(series.limitCents)} stroke="#9a6700" strokeDasharray="4 4" />
      <text x={W - PAD.right} y={y(series.limitCents) - 4} fontSize="11" textAnchor="end" fill="#9a6700">
        limit {formatUsd(series.limitCents)}
      </text>
      <text x={PAD.left - 6} y={y(0) + 4} fontSize="11" textAnchor="end" fill="#5d6878">
        $0
      </text>
      <path d={line(series.paceCents)} fill="none" stroke="#8c959f" strokeWidth="2" strokeDasharray="6 4" />
      <path d={line(series.cumulativeSpentCents)} fill="none" stroke="#1f6feb" strokeWidth="2.5" />
      {n > 0 && (
        <>
          <text x={x(0)} y={H - 14} fontSize="11" fill="#5d6878">
            {shortDate(series.dates[0])}
          </text>
          <text x={x(n - 1)} y={H - 14} fontSize="11" textAnchor="end" fill="#5d6878">
            {shortDate(series.dates[n - 1])}
          </text>
        </>
      )}
    </svg>
  );
}
