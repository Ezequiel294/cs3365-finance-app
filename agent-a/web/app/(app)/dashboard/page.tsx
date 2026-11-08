import Link from "next/link";
import { formatUsd } from "@finance/shared";
import { getProgress } from "@/actions/budget-actions";
import { listConnections } from "@/actions/connection-actions";
import { listReview } from "@/actions/review-actions";
import { BarList } from "@/components/bar-list";
import { StaleConnectionBanner } from "@/components/stale-banner";
import { AnalyticsLoader } from "@/lib/analytics-loader";
import { addMonths, monthName, percent, todayIn } from "@/lib/format";

/** 04-S01 and 04-S03: where a month's money went, by category or by tag. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const thisMonth = todayIn().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : addMonths(thisMonth, -1);
  const groupBy = q.groupBy === "tag" ? "tag" : "category";

  const [progress, connections, review] = await Promise.all([getProgress(), listConnections(), listReview()]);
  const budgets = progress.ok ? progress.data : [];
  const link = (m: string, g: string) => `/dashboard?month=${m}&groupBy=${g}`;

  let content: React.ReactNode;
  if (groupBy === "category") {
    const rows = await AnalyticsLoader.spendingByCategory(month);
    const total = rows.reduce((s, r) => s + r.expenseCents, 0);
    content = (
      <>
        {rows[0] && (
          <p className="big" style={{ fontSize: "1.2rem" }}>
            {rows[0].name} took {percent(rows[0].share)} of {monthName(month).split(" ")[0]}
          </p>
        )}
        <p className="muted">Total spending {formatUsd(total)} (USD; colón amounts converted at the BCCR rate of each day).</p>
        <BarList
          empty="No spending recorded for this month."
          rows={rows.map((r) => ({ key: r.categoryId, label: r.name, amountCents: r.expenseCents, fraction: r.share, right: percent(r.share) }))}
        />
      </>
    );
  } else {
    const rows = await AnalyticsLoader.spendingByTag(month, budgets);
    const max = Math.max(1, ...rows.map((r) => r.budgetLimitCents ?? r.expenseCents));
    content = (
      <>
        <p className="muted">Tag totals can overlap: a transaction with two tags counts in both.</p>
        <BarList
          empty="No tagged spending for this month."
          rows={rows.map((r) => ({
            key: r.tagId,
            label: r.budgetLimitCents ? `${r.name} ${formatUsd(r.expenseCents)} of ${formatUsd(r.budgetLimitCents)}` : r.name,
            amountCents: r.expenseCents,
            fraction: r.budgetLimitCents ? r.expenseCents / r.budgetLimitCents : r.expenseCents / max,
            right: r.budgetLimitCents ? `${Math.round((r.expenseCents / r.budgetLimitCents) * 100)}% of budget` : undefined,
            over: !!r.budgetLimitCents && r.expenseCents > r.budgetLimitCents,
          }))}
        />
      </>
    );
  }

  return (
    <>
      {connections.ok && <StaleConnectionBanner connections={connections.data} />}
      {review.ok && review.data.count > 0 && (
        <div className="banner info">
          <Link href="/review">{review.data.count} to review</Link>
          <span className="muted">Uncategorized transactions, possible duplicates, and unread bank emails.</span>
        </div>
      )}
      <div className="row between">
        <h1>Where the money went</h1>
        <div className="row">
          <Link href={link(addMonths(month, -1), groupBy)}>← {monthName(addMonths(month, -1))}</Link>
          <b>{monthName(month)}</b>
          {month < thisMonth && <Link href={link(addMonths(month, 1), groupBy)}>{monthName(addMonths(month, 1))} →</Link>}
        </div>
      </div>
      <div className="segmented" role="tablist" style={{ marginBottom: "1rem" }}>
        <Link className={groupBy === "category" ? "on" : ""} href={link(month, "category")}>
          Category
        </Link>
        <Link className={groupBy === "tag" ? "on" : ""} href={link(month, "tag")}>
          Tag
        </Link>
      </div>
      <div className="card">{content}</div>

      <h2>Budgets this period</h2>
      <div className="card">
        {budgets.length === 0 ? (
          <p className="muted">
            No budgets yet. <Link href="/budgets">Create one</Link>.
          </p>
        ) : (
          <BarList
            empty=""
            rows={budgets.map((b) => ({
              key: b.budget.id,
              label: `${b.budget.name} ${b.percent}%`,
              amountCents: b.spentCents,
              fraction: b.spentCents / b.limitCents,
              right: b.overByCents > 0 ? `${formatUsd(b.overByCents)} over ${formatUsd(b.limitCents)}` : `of ${formatUsd(b.limitCents)}`,
              over: b.overByCents > 0,
            }))}
          />
        )}
      </div>
    </>
  );
}
