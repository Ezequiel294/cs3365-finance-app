import { formatUsd, type BudgetProgress } from '@finance/shared';
import Link from 'next/link';
import { AnalyticsLoader } from '@/lib/analytics-loader';
import { addMonths, lastMonth, monthLabel, safe, shortDate } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

/** DashboardPage (04-S01, 04-S03, 01-S09): where the month's money went, by category or tag. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month! : lastMonth();
  const groupBy = params.groupBy === 'tag' ? 'tag' : 'category';
  const returnTo = `/dashboard?month=${month}&groupBy=${groupBy}`;

  const [categories, tags, budgets, connections, reviewCount] = await Promise.all([
    groupBy === 'category' ? safe(AnalyticsLoader.spendingByCategory(month, returnTo)) : Promise.resolve({ data: null, error: null }),
    groupBy === 'tag' ? safe(AnalyticsLoader.spendingByTag(month, returnTo)) : Promise.resolve({ data: null, error: null }),
    safe(AnalyticsLoader.budgetProgress(returnTo)),
    safe(AnalyticsLoader.connections(returnTo)),
    safe(AnalyticsLoader.reviewCount(returnTo)),
  ]);

  const stale = (connections.data ?? []).filter((c) => c.stale);
  const tagBudget = (tagId: string): BudgetProgress | undefined =>
    (budgets.data ?? []).find((b) => b.budget.tagIds.includes(tagId) && b.budget.categoryIds.length === 0);
  const top = categories.data?.[0];

  return (
    <>
      {stale.map((c) => (
        <div key={c.connection.id} className="banner warn">
          Your Gmail connection stopped on {shortDate(c.connection.lastSeenAt)}. <Link href="/connections">Reconnect?</Link>
        </div>
      ))}
      {(reviewCount.data ?? 0) > 0 && (
        <div className="banner info">
          <Link href="/review">{reviewCount.data} to review</Link>
        </div>
      )}
      <h1>Where {monthLabel(month)}&apos;s money went</h1>
      <div className="row" style={{ marginBottom: '1rem' }}>
        <div className="tabs">
          <Link href={`/dashboard?month=${addMonths(month, -1)}&groupBy=${groupBy}`}>← {monthLabel(addMonths(month, -1))}</Link>
          <span>·</span>
          <Link href={`/dashboard?month=${addMonths(month, 1)}&groupBy=${groupBy}`}>{monthLabel(addMonths(month, 1))} →</Link>
        </div>
        <div className="tabs" style={{ justifyContent: 'flex-end' }}>
          <Link href={`/dashboard?month=${month}&groupBy=category`}>
            <button className={groupBy === 'category' ? 'active' : ''} type="button">Category</button>
          </Link>
          <Link href={`/dashboard?month=${month}&groupBy=tag`}>
            <button className={groupBy === 'tag' ? 'active' : ''} type="button">Tag</button>
          </Link>
        </div>
      </div>

      <div className="card">
        {groupBy === 'category' ? (
          <>
            {categories.error && <p className="error">{categories.error}</p>}
            {top && (
              <p>
                <strong>{top.name}</strong> took {Math.round(top.share * 100)}% of {monthLabel(month)}.
              </p>
            )}
            {categories.data && categories.data.length === 0 && <p className="muted">No spending recorded for this month.</p>}
            <table>
              <tbody>
                {(categories.data ?? []).map((row) => (
                  <tr key={row.categoryId ?? 'uncategorized'}>
                    <td style={{ width: '30%' }}>{row.name}</td>
                    <td>
                      <div className="bar">
                        <span style={{ width: `${Math.max(0, Math.min(100, row.share * 100))}%` }} />
                      </div>
                    </td>
                    <td className="num">{Math.round(row.share * 100)}%</td>
                    <td className="num">{formatUsd(row.expenseCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            {tags.error && <p className="error">{tags.error}</p>}
            <p className="muted">Tag totals can overlap: a transaction with two tags counts in both.</p>
            {tags.data && tags.data.length === 0 && <p className="muted">No tagged spending this month.</p>}
            <table>
              <tbody>
                {(tags.data ?? []).map((row) => {
                  const b = tagBudget(row.tagId);
                  const limit = b?.limitCents ?? row.budgetLimitCents;
                  return (
                    <tr key={row.tagId}>
                      <td>{row.name}</td>
                      <td className="num">
                        {formatUsd(row.expenseCents)}
                        {limit ? ` of ${formatUsd(limit)}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      <h2>Budgets this period</h2>
      <div className="card">
        {budgets.error && <p className="error">{budgets.error}</p>}
        {budgets.data?.length === 0 && (
          <p className="muted">
            No budgets yet. <Link href="/budgets">Create one</Link>.
          </p>
        )}
        <table>
          <tbody>
            {(budgets.data ?? []).map((b) => (
              <tr key={b.budget.id}>
                <td>{b.budget.name}</td>
                <td className="num">
                  {b.percent}% ({formatUsd(b.spentCents)} of {formatUsd(b.limitCents)}
                  {b.overByCents > 0 ? `, ${formatUsd(b.overByCents)} over` : ''})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
