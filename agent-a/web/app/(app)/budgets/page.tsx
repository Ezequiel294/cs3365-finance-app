import Link from "next/link";
import { formatUsd } from "@finance/shared";
import { getProgress } from "@/actions/budget-actions";
import { getReference } from "@/actions/setup-actions";
import { EditBudget, NewBudgetForm } from "@/components/budget-forms";
import { shortDate } from "@/lib/format";

/** 03-S02, 03-S10, 03-S11: every budget with spent, limit, remaining, and the proportion used (above 100% when over). */
export default async function BudgetsPage() {
  const [progress, ref] = await Promise.all([getProgress(), getReference()]);
  if (!progress.ok) return <p className="error-text">{progress.error}</p>;
  if (!ref.ok) return <p className="error-text">{ref.error}</p>;
  const names = new Map([...ref.data.categories, ...ref.data.tags].map((l) => [l.id, l.name]));

  return (
    <>
      <h1>Budgets</h1>
      {progress.data.length === 0 && <p className="muted">No budgets yet.</p>}
      {progress.data.map((p) => {
        const over = p.overByCents > 0;
        return (
          <div key={p.budget.id} className="card">
            <div className="row between">
              <div>
                <Link href={`/budgets/${p.budget.id}`}>
                  <b>{p.budget.name}</b>
                </Link>
                <div className="muted small">
                  {[...p.budget.categoryIds, ...p.budget.tagIds].map((id) => names.get(id) ?? id).join(", ")} · {shortDate(p.periodStart)} to {shortDate(p.periodEnd)}
                </div>
              </div>
              <div className={`big ${over ? "bad" : ""}`} style={{ fontSize: "1.3rem" }}>
                {p.percent}%
              </div>
            </div>
            <p style={{ margin: "0.4rem 0" }}>
              {formatUsd(p.spentCents)} of {formatUsd(p.limitCents)}
              {over ? <b className="bad">, {formatUsd(p.overByCents)} over</b> : <span className="muted">, {formatUsd(p.remainingCents)} left</span>}
            </p>
            <div className="bar-track" aria-hidden>
              <div className={`bar-fill${over ? " over" : ""}`} style={{ width: `${Math.min(100, p.percent)}%` }} />
            </div>
            <div style={{ marginTop: "0.6rem" }}>
              <EditBudget budget={p.budget} />
            </div>
          </div>
        );
      })}
      <NewBudgetForm categories={ref.data.categories} tags={ref.data.tags} />
      <p className="muted small">Categories and tags without a budget still have totals on the dashboard, just no limit.</p>
    </>
  );
}
