import Link from 'next/link';
import type { CategoryShare, TagTotal } from '@/shared/api-types';
import { OTHER_CATEGORY_ID, UNCATEGORIZED_ID } from '@/shared/catalog';
import { BarList, type BarRow } from '../../ui/charts/BarList';
import { ChartFrame } from '../../ui/charts/ChartFrame';
import { formatBps, formatMoney, formatMonth } from '../../ui/format';

const isCatchAll = (id: string) => id === OTHER_CATEGORY_ID || id === UNCATEGORIZED_ID;

/** "{category} took {share}% of {month}"; a catch-all is never the headline. */
export function headline(byCategory: CategoryShare[], month: string): string | null {
  const top = byCategory.filter((c) => !isCatchAll(c.categoryId)).sort((a, b) => b.expenseCents - a.expenseCents)[0];
  return top ? `${top.name} took ${formatBps(Math.round(top.share / 100) * 100)} of ${formatMonth(month)}` : null;
}

/** "Where the money went": category or tag view of one month (04-S01, 04-S03). */
export function SpendingBreakdown({
  month,
  groupBy,
  byCategory,
  byTag,
  uncategorizedCount,
}: {
  month: string;
  groupBy: 'category' | 'tag';
  byCategory?: CategoryShare[];
  byTag?: TagTotal[];
  uncategorizedCount: number;
}) {
  const toggle = (
    <nav aria-label="Group by" className="flex gap-1 text-sm">
      {(['category', 'tag'] as const).map((g) => (
        <Link
          key={g}
          href={`/dashboard?month=${month}${g === 'tag' ? '&groupBy=tag' : ''}`}
          aria-current={groupBy === g ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-[6px] border px-3 sm:min-h-8 ${groupBy === g ? 'border-accent font-semibold text-accent' : 'border-border text-text-secondary'}`}
        >
          {g === 'category' ? 'Category' : 'Tag'}
        </Link>
      ))}
    </nav>
  );

  if (groupBy === 'tag') {
    const tags = byTag ?? [];
    const rows: BarRow[] = tags.map((t) => ({
      key: t.tagId,
      label: t.name,
      valueCents: t.expenseCents,
      markerCents: t.budgetLimitCents,
      markerLabel: t.budgetLimitCents != null ? `Limit ${formatMoney(t.budgetLimitCents)}` : undefined,
    }));
    const top = tags[0];
    return (
      <div className="flex flex-col gap-4">
        {toggle}
        <ChartFrame
          title="Spending by tag"
          summary={top ? `${top.name} took ${formatMoney(top.expenseCents)} in ${formatMonth(month)}.` : `No tagged spending in ${formatMonth(month)}.`}
          table={{
            columns: [
              { key: 'tag', label: 'Tag' },
              { key: 'spent', label: 'Spent', align: 'right' },
              { key: 'limit', label: 'Budget limit', align: 'right' },
            ],
            rows: tags.map((t) => ({
              _key: t.tagId,
              tag: t.name,
              spent: formatMoney(t.expenseCents),
              limit: t.budgetLimitCents != null ? formatMoney(t.budgetLimitCents) : '—',
            })),
          }}
          points={rows.length}
          minPoints={1}
          notEnoughData={`No tagged spending in ${formatMonth(month)}. Add tags to transactions to see them here.`}
        >
          <BarList rows={rows} tailLabel={(n, c) => `${n} smaller tags · ${formatMoney(c)}`} />
        </ChartFrame>
        <p className="text-[13px] text-text-secondary">A purchase with two tags counts in both, so tags can add up to more than the total.</p>
      </div>
    );
  }

  const cats = byCategory ?? [];
  const rows: BarRow[] = cats.map((c) => ({
    key: c.categoryId,
    label: c.name,
    valueCents: c.expenseCents,
    shareBps: c.share,
    muted: isCatchAll(c.categoryId),
  }));
  const head = headline(cats, month);
  const uncategorized = cats.find((c) => c.categoryId === UNCATEGORIZED_ID);
  return (
    <div className="flex flex-col gap-4">
      {toggle}
      <ChartFrame
        title="Spending by category"
        summary={head ?? (cats.length ? `Nothing in ${formatMonth(month)} is filed under a category yet.` : `No spending in ${formatMonth(month)}.`)}
        table={{
          columns: [
            { key: 'category', label: 'Category' },
            { key: 'share', label: 'Share', align: 'right' },
            { key: 'spent', label: 'Spent', align: 'right' },
          ],
          rows: cats.map((c) => ({ _key: c.categoryId, category: c.name, share: formatBps(c.share), spent: formatMoney(c.expenseCents) })),
        }}
        points={rows.length}
        minPoints={1}
        notEnoughData={`No spending in ${formatMonth(month)}.`}
      >
        <BarList rows={rows} />
      </ChartFrame>
      {uncategorized ? (
        <p className="text-sm">
          {formatBps(Math.round(uncategorized.share / 100) * 100)} of {formatMonth(month)} is not filed yet.{' '}
          <Link href="/review" className="text-accent underline">
            Review {uncategorizedCount} transactions
          </Link>
        </p>
      ) : null}
    </div>
  );
}
