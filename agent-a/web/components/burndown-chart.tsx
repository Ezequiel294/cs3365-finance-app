'use client';

import { formatUsd, type BurndownSeries } from '@finance/shared';

/** Cumulative spending per day against the even-pace line (03-S11). */
export function BurndownChart({ series }: { series: BurndownSeries }) {
  const w = 640;
  const h = 200;
  const n = series.dates.length;
  if (n === 0) return <p className="muted">This period has not started yet.</p>;
  const max = Math.max(1, series.limitCents, ...series.cumulativeSpentCents);
  const x = (i: number) => 40 + (n > 1 ? (i * (w - 60)) / (n - 1) : 0);
  const y = (v: number) => h - 25 - (Math.max(0, v) / max) * (h - 45);
  const pts = (vals: number[]) => vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Budget burn-down">
      <line x1="40" x2={w - 20} y1={y(series.limitCents)} y2={y(series.limitCents)} stroke="#b42318" strokeDasharray="4 4" />
      <text x={w - 20} y={y(series.limitCents) - 4} fontSize="10" textAnchor="end" fill="#b42318">
        limit {formatUsd(series.limitCents)}
      </text>
      <polyline fill="none" stroke="#9aa5b1" strokeWidth="2" strokeDasharray="6 4" points={pts(series.paceCents)} />
      <polyline fill="none" stroke="#0f6cbd" strokeWidth="3" points={pts(series.cumulativeSpentCents)} />
      <text x="44" y="14" fontSize="11" fill="#0f6cbd">● Spent so far</text>
      <text x="140" y="14" fontSize="11" fill="#5d6b7a">- - Even pace</text>
      <text x="40" y={h - 8} fontSize="10">{series.dates[0]}</text>
      <text x={w - 20} y={h - 8} fontSize="10" textAnchor="end">{series.dates[n - 1]}</text>
    </svg>
  );
}
