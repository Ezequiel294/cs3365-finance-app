import { formatUsd } from '@finance/shared';
import { AnalyticsLoader } from '@/lib/analytics-loader';
import { addMonths, monthLabel, safe, thisMonth } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

/** CashflowPage (04-S06): income and spending per month on one timeline. */
export default async function CashflowPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const months = Math.min(36, Math.max(3, Number(params.months ?? 12) || 12));
  const to = addMonths(thisMonth(), -1);
  const from = addMonths(to, -(months - 1));
  const { data, error } = await safe(AnalyticsLoader.monthlyTotals(from, to, `/cashflow?months=${months}`));
  const points = data ?? [];
  const max = Math.max(1, ...points.flatMap((p) => [p.incomeCents, p.expenseCents]));
  const w = 760;
  const h = 240;
  const step = points.length > 1 ? (w - 60) / (points.length - 1) : 0;
  const y = (v: number) => h - 30 - (Math.max(0, v) / max) * (h - 50);
  const line = (key: 'incomeCents' | 'expenseCents') => points.map((p, i) => `${40 + i * step},${y(p[key])}`).join(' ');

  return (
    <>
      <h1>Money in and out</h1>
      {error && <p className="error">{error}</p>}
      <div className="card">
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Income and spending per month">
          <line x1="40" x2={w - 20} y1={h - 30} y2={h - 30} stroke="#ccc" />
          <polyline fill="none" stroke="#1a7f37" strokeWidth="3" points={line('incomeCents')} />
          <polyline fill="none" stroke="#b42318" strokeWidth="3" points={line('expenseCents')} />
          {points.map((p, i) => (
            <g key={p.month}>
              <circle cx={40 + i * step} cy={y(p.incomeCents)} r="3" fill="#1a7f37" />
              <circle cx={40 + i * step} cy={y(p.expenseCents)} r="3" fill="#b42318" />
              <text x={40 + i * step} y={h - 12} fontSize="10" textAnchor="middle">
                {p.month.slice(2)}
              </text>
            </g>
          ))}
          <text x="44" y="16" fontSize="12" fill="#1a7f37">● Money in</text>
          <text x="130" y="16" fontSize="12" fill="#b42318">● Spending</text>
        </svg>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Money in</th>
              <th className="num">Spending</th>
              <th className="num">Difference</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.month}>
                <td>{monthLabel(p.month)}</td>
                <td className="num">{formatUsd(p.incomeCents)}</td>
                <td className="num">{formatUsd(p.expenseCents)}</td>
                <td className="num">{formatUsd(p.incomeCents - p.expenseCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">All amounts in USD. Transfers between your own accounts are not counted.</p>
      </div>
    </>
  );
}
