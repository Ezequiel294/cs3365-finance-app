import { addMonths, firstDayOfMonth, lastDayOfMonth } from '@/shared/dates';
import { countsAsSpending, flowOf } from '@/shared/kinds';
import { listTransactions } from '../../actions/transaction-actions';
import { AnalyticsLoader } from '../../lib/analytics-loader';
import { loadAccounts, loadCatalog, loadToday } from '../../lib/loaders';
import { ButtonLink } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { formatMoney, formatMonth } from '../../ui/format';
import { MonthPicker } from '../../ui/MonthPicker';
import { PageHeader } from '../../ui/PageHeader';
import { OpenQuickAdd } from '../../ui/QuickAddTransaction';
import { Section } from '../../ui/Section';
import { isMonth } from '../dashboard/constants';
import { TransactionTable } from './TransactionTable';

export const dynamic = 'force-dynamic';

/** What exactly did I spend and receive this month? (05-S01, 02-S02) */
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { currentMonth, currentYear } = await loadToday();
  const totals = await AnalyticsLoader.monthlyTotals(addMonths(currentMonth, -11), currentMonth);
  const has = (m: { incomeCents: number; expenseCents: number }) => m.incomeCents !== 0 || m.expenseCents !== 0;
  const latest = totals.ok ? ([...totals.data].reverse().find(has)?.month ?? null) : null;
  const urlMonth = isMonth(params.month) && params.month <= currentMonth ? params.month : null;
  const month =
    urlMonth ?? (totals.ok && totals.data.find((m) => m.month === currentMonth && has(m)) ? currentMonth : (latest ?? currentMonth));

  const [txns, catalog, accounts] = await Promise.all([
    listTransactions(firstDayOfMonth(month), lastDayOfMonth(month)),
    loadCatalog(),
    loadAccounts(),
  ]);

  const header = (
    <PageHeader
      title="Transactions"
      monthPicker={<MonthPicker month={month} currentMonth={currentMonth} latestMonthWithData={latest} basePath="/transactions" />}
      primaryAction={<OpenQuickAdd variant="primary" />}
    />
  );
  if (!txns.ok) return <>{header}<ErrorState message={txns.message} /></>;

  const list = txns.data;
  if (!list.length) {
    return (
      <>
        {header}
        {latest && latest !== month ? (
          <EmptyState
            title={`No transactions in ${formatMonth(month)}`}
            body={`Your latest transactions are in ${formatMonth(latest)}.`}
            actions={<ButtonLink href={`/transactions?month=${latest}`} variant="primary">{`Go to ${formatMonth(latest)}`}</ButtonLink>}
          />
        ) : latest ? (
          <EmptyState title={`No transactions in ${formatMonth(month)}`} body="Add a transaction or import a statement for this month." />
        ) : (
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
        )}
      </>
    );
  }

  const spent = list.filter(countsAsSpending).reduce((s, t) => s + (flowOf(t.kind) === 'refund' ? -t.amountUsdCents : t.amountUsdCents), 0);
  const moneyIn = list.filter((t) => flowOf(t.kind) === 'income').reduce((s, t) => s + t.amountUsdCents, 0);

  return (
    <>
      {header}
      <p className="mb-4 text-sm tabular">
        {list.length} transactions · {formatMoney(spent)} spent · {formatMoney(moneyIn)} in
      </p>
      <Section>
        <TransactionTable
          transactions={list}
          catalog={catalog.ok ? catalog.data : { categories: [], tags: [] }}
          accounts={accounts.ok ? accounts.data : []}
          currentYear={currentYear}
        />
      </Section>
    </>
  );
}
