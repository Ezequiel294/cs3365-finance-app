import Link from "next/link";
import { formatUsd } from "@finance/shared";
import { getBurndown, getProgress } from "@/actions/budget-actions";
import { BurndownChart } from "@/components/charts";
import { shortDate } from "@/lib/format";

/** 03-S11: one budget's burn-down for the current period. */
export default async function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [series, progress] = await Promise.all([getBurndown(id), getProgress()]);
  if (!series.ok) return <p className="error-text">{series.error}</p>;
  const p = progress.ok ? progress.data.find((b) => b.budget.id === id) : undefined;
  const spent = series.data.cumulativeSpentCents.at(-1) ?? 0;
  const pace = series.data.paceCents.at(-1) ?? 0;

  return (
    <>
      <p>
        <Link href="/budgets">← Budgets</Link>
      </p>
      <h1>{p?.budget.name ?? "Budget"}</h1>
      {p && (
        <p className={p.overByCents > 0 ? "bad" : ""}>
          <b>{p.percent}%</b> used: {formatUsd(p.spentCents)} of {formatUsd(p.limitCents)}
          {p.overByCents > 0 ? `, ${formatUsd(p.overByCents)} over` : `, ${formatUsd(p.remainingCents)} left`}
        </p>
      )}
      <div className="card">
        <div className="legend">
          <span>
            <span className="swatch" style={{ background: "#1f6feb" }} />
            Spent so far
          </span>
          <span>
            <span className="swatch" style={{ background: "#8c959f" }} />
            Even pace
          </span>
        </div>
        <BurndownChart series={series.data} />
        <p className="muted small">
          {shortDate(series.data.periodStart)} to {shortDate(series.data.periodEnd)}. Today you are {spent > pace ? `${formatUsd(spent - pace)} ahead of` : `${formatUsd(pace - spent)} under`} an even pace.
        </p>
      </div>
    </>
  );
}
