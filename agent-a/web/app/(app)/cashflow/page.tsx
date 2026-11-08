import Link from "next/link";
import { formatUsd } from "@finance/shared";
import { CashflowChart } from "@/components/charts";
import { AnalyticsLoader } from "@/lib/analytics-loader";
import { addMonths, monthName, todayIn } from "@/lib/format";

/** 04-S06: money in alongside money out, per month. */
export default async function CashflowPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const count = [6, 12, 24].includes(Number(q.months)) ? Number(q.months) : 12;
  const to = addMonths(todayIn().slice(0, 7), -1);
  const from = addMonths(to, -(count - 1));
  const months = await AnalyticsLoader.monthlyTotals(from, to);
  const income = months.reduce((s, m) => s + m.incomeCents, 0);
  const spent = months.reduce((s, m) => s + m.expenseCents, 0);

  return (
    <>
      <h1>Money in and out</h1>
      <div className="segmented" style={{ marginBottom: "1rem" }}>
        {[6, 12, 24].map((n) => (
          <Link key={n} className={n === count ? "on" : ""} href={`/cashflow?months=${n}`}>
            {n} months
          </Link>
        ))}
      </div>
      <div className="card">
        <div className="legend">
          <span>
            <span className="swatch" style={{ background: "#1a7f37" }} />
            Money in {formatUsd(income)}
          </span>
          <span>
            <span className="swatch" style={{ background: "#cf222e" }} />
            Spending {formatUsd(spent)}
          </span>
        </div>
        <CashflowChart months={months} />
      </div>
      <div className="card">
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
            {months.map((m) => (
              <tr key={m.month}>
                <td>{monthName(m.month)}</td>
                <td className="num">{formatUsd(m.incomeCents)}</td>
                <td className="num">{formatUsd(m.expenseCents)}</td>
                <td className={`num ${m.incomeCents - m.expenseCents < 0 ? "bad" : "good"}`}>{formatUsd(m.incomeCents - m.expenseCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Transfers between your own accounts and card payments are not counted as spending.</p>
      </div>
    </>
  );
}
