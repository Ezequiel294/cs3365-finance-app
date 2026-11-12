import { addMonths } from '@/shared/dates';
import { getProgress } from '../../actions/budget-actions';
import { AnalyticsLoader } from '../../lib/analytics-loader';
import { loadReview, loadToday } from '../../lib/loaders';
import { ButtonLink } from '../../ui/Button';
import { Delta } from '../../ui/Delta';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { Money } from '../../ui/Money';
import { MonthPicker } from '../../ui/MonthPicker';
import { PageHeader } from '../../ui/PageHeader';
import { Section, SectionGrid } from '../../ui/Section';
import { StatRow, StatTile } from '../../ui/StatTile';
import { Tabs } from '../../ui/Tabs';
import { BudgetStrip } from './BudgetStrip';
import { DASHBOARD_TABS, FOOTNOTE, isMonth } from './constants';
import { MoneyInOutChart } from './MoneyInOutChart';
import { SpendingBreakdown } from './SpendingBreakdown';

export const dynamic = 'force-dynamic';

/** Where did this month's money go, and am I inside my budgets? (04-S01a) */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { currentMonth } = await loadToday();
  const urlMonth = isMonth(params.month) && params.month <= currentMonth ? params.month : null;
  const groupBy = params.groupBy === 'tag' ? 'tag' : 'category';
  const end = urlMonth ?? currentMonth;

  const totals = await AnalyticsLoader.monthlyTotals(addMonths(end, -11), end);
  if (!totals.ok) return <ErrorState message={totals.message} />;
  const has = (m: { incomeCents: number; expenseCents: number }) => m.incomeCents !== 0 || m.expenseCents !== 0;
  const latestWithData = [...totals.data].reverse().find(has)?.month ?? null;
  const month = urlMonth ?? (totals.data.find((m) => m.month === currentMonth && has(m)) ? currentMonth : (latestWithData ?? currentMonth));

  const header = (
    <PageHeader
      title="Dashboard"
      tabs={<Tabs items={DASHBOARD_TABS} current="spending" />}
      monthPicker={<MonthPicker month={month} currentMonth={currentMonth} latestMonthWithData={latestWithData} basePath="/dashboard" params={{ groupBy: groupBy === 'tag' ? 'tag' : undefined }} />}
    />
  );

  if (!latestWithData) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing to show yet"
          body="Import a statement, connect Gmail, or add a transaction to see where your money goes."
          actions={
            <>
              <ButtonLink href="/import" variant="primary">
                Import a statement
              </ButtonLink>
              <ButtonLink href="/connections">Connect Gmail</ButtonLink>
            </>
          }
        />
      </>
    );
  }

  const [breakdown, progress, review] = await Promise.all([
    groupBy === 'tag' ? AnalyticsLoader.spendingByTag(month) : AnalyticsLoader.spendingByCategory(month),
    getProgress(),
    loadReview(),
  ]);

  const row = totals.data.find((m) => m.month === month) ?? { month, incomeCents: 0, expenseCents: 0 };
  const leftOver = row.incomeCents - row.expenseCents;
  const toReview = review.ok ? review.data.count : 0;
  const sixMonths = totals.data.slice(-6);

  return (
    <>
      {header}
      <StatRow>
        <StatTile label="Spent" value={<Money cents={row.expenseCents} />} />
        <StatTile label="Money in" value={<Money cents={row.incomeCents} />} />
        <StatTile label="Left over" value={<Delta amountCents={leftOver} />} />
        <StatTile label="To review" value={String(toReview)} caption={toReview === 0 ? 'All caught up' : undefined} href="/review" />
      </StatRow>
      <SectionGrid>
        <Section title="Where the money went">
          {breakdown.ok ? (
            <SpendingBreakdown
              month={month}
              groupBy={groupBy}
              byCategory={groupBy === 'category' ? (breakdown.data as never) : undefined}
              byTag={groupBy === 'tag' ? (breakdown.data as never) : undefined}
              uncategorizedCount={review.ok ? review.data.uncategorized.length : 0}
            />
          ) : (
            <p className="text-sm text-negative">{breakdown.message}</p>
          )}
        </Section>
        <Section title="Budgets">{progress.ok ? <BudgetStrip budgets={progress.data} /> : <p className="text-sm text-negative">{progress.message}</p>}</Section>
        <Section title="Last 6 months" wide action={<a href="/cashflow" className="text-sm text-accent underline">See 12 months</a>}>
          <MoneyInOutChart title="Money in and spending" months={sixMonths} />
        </Section>
      </SectionGrid>
      <p className="mt-6 text-[13px] text-text-secondary">{FOOTNOTE}</p>
    </>
  );
}
