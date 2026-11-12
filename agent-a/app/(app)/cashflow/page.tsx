import { addMonths } from '@/shared/dates';
import { AnalyticsLoader } from '../../lib/analytics-loader';
import { loadToday } from '../../lib/loaders';
import { ButtonLink } from '../../ui/Button';
import { DataTable } from '../../ui/DataTable';
import { Delta } from '../../ui/Delta';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { formatMoney, formatMonth } from '../../ui/format';
import { Money } from '../../ui/Money';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { StatRow, StatTile } from '../../ui/StatTile';
import { Tabs } from '../../ui/Tabs';
import { DASHBOARD_TABS, FOOTNOTE } from '../dashboard/constants';
import { MoneyInOutChart } from '../dashboard/MoneyInOutChart';

export const dynamic = 'force-dynamic';

/** When did money arrive, and how did spending track it? (04-S06) */
export default async function CashflowPage() {
  const { currentMonth } = await loadToday();
  const totals = await AnalyticsLoader.monthlyTotals(addMonths(currentMonth, -11), currentMonth);
  const header = <PageHeader title="Money in and out" tabs={<Tabs items={DASHBOARD_TABS} current="cashflow" />} />;
  if (!totals.ok) return <>{header}<ErrorState message={totals.message} /></>;

  const first = totals.data.findIndex((m) => m.incomeCents !== 0 || m.expenseCents !== 0);
  if (first < 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing to show yet"
          body="Import a statement, connect Gmail, or add a transaction to see where your money goes."
          actions={
            <>
              <ButtonLink href="/import" variant="primary">Import a statement</ButtonLink>
              <ButtonLink href="/connections">Connect Gmail</ButtonLink>
            </>
          }
        />
      </>
    );
  }
  const months = totals.data.slice(first);
  const income = months.reduce((s, m) => s + m.incomeCents, 0);
  const spent = months.reduce((s, m) => s + m.expenseCents, 0);
  const range = months.length > 1 ? `${formatMonth(months[0]!.month)} – ${formatMonth(months[months.length - 1]!.month)}` : formatMonth(months[0]!.month);

  return (
    <>
      {header}
      <StatRow columns={3}>
        <StatTile label="Money in" value={<Money cents={income} />} caption={range} />
        <StatTile label="Spent" value={<Money cents={spent} />} caption={range} />
        <StatTile label="Left over" value={<Delta amountCents={income - spent} />} caption={range} />
      </StatRow>
      <div className="flex flex-col gap-6">
        <Section title="Money in and out">
          <MoneyInOutChart title="Money in and spending by month" months={months} />
        </Section>
        <Section title="By month">
          <DataTable
            caption="By month"
            columns={[
              { key: 'month', label: 'Month' },
              { key: 'in', label: 'Money in', align: 'right' },
              { key: 'spent', label: 'Spent', align: 'right' },
              { key: 'left', label: 'Left over', align: 'right' },
            ]}
            rows={[...months].reverse().map((m) => ({
              _key: m.month,
              month: formatMonth(m.month),
              in: formatMoney(m.incomeCents),
              spent: formatMoney(m.expenseCents),
              left: <Delta amountCents={m.incomeCents - m.expenseCents} />,
            }))}
          />
        </Section>
      </div>
      <p className="mt-6 text-[13px] text-text-secondary">{FOOTNOTE}</p>
    </>
  );
}
