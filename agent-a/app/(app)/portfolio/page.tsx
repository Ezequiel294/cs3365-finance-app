import { formatMoney } from '@/shared/money';
import type { Broker } from '@/shared/types';
import { getFlows, getLiquidation, getValuation, listBrokers, listInvestments } from '../../actions/investment-actions';
import { loadToday } from '../../lib/loaders';
import { Badge, StatusBadge } from '../../ui/Badge';
import { DataTable } from '../../ui/DataTable';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { formatBps, formatDateTime, formatDay, formatQuantity } from '../../ui/format';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { Tabs } from '../../ui/Tabs';
import { FEE_ROWS, getFee } from './BrokerFeesForm';
import { AddBrokerButton, CorrectButton, EditFeesButton, PortfolioDialogs, RecordButton } from './PortfolioDialogs';
import { PortfolioOverview } from './PortfolioOverview';

export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'transactions' | 'brokers';
const TYPE_LABEL = { DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', BUY: 'Buy', SELL: 'Sell' } as const;

/** What are my investments worth, what did they cost me, and what would reach my bank? (07-S02a) */
export default async function PortfolioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const tab: Tab = params.tab === 'transactions' || params.tab === 'brokers' ? params.tab : 'overview';
  const { timeZone, today, currentYear } = await loadToday();
  const now = new Date();

  const [brokers, valuation, liquidation, flows, investments] = await Promise.all([
    listBrokers(),
    getValuation(),
    tab === 'overview' ? getLiquidation() : Promise.resolve(null),
    tab === 'overview' ? getFlows(12) : Promise.resolve(null),
    tab === 'transactions' ? listInvestments() : Promise.resolve(null),
  ]);

  const tabs = (
    <Tabs
      current={tab}
      items={[
        { id: 'overview', label: 'Overview', href: '/portfolio?tab=overview' },
        { id: 'transactions', label: 'Transactions', href: '/portfolio?tab=transactions' },
        { id: 'brokers', label: 'Brokers and fees', href: '/portfolio?tab=brokers' },
      ]}
    />
  );
  const failed = [brokers, valuation, liquidation, flows, investments].find((r) => r && !r.ok);
  if (failed && !failed.ok) {
    return (
      <>
        <PageHeader title="Portfolio" tabs={tabs} />
        <ErrorState message={failed.message} />
      </>
    );
  }
  const brokerList: Broker[] = brokers.ok ? brokers.data : [];
  const v = valuation.ok ? valuation.data : null;
  const anyStale = v?.holdings.some((h) => h.stale) ?? false;
  const subtitle = v?.priceTime ? (
    <span className="flex flex-wrap items-center gap-3">
      Prices as of {formatDateTime(v.priceTime, timeZone)}
      {anyStale ? <StatusBadge status="warning" label="Some prices are older" /> : null}
    </span>
  ) : undefined;

  const header = <PageHeader title="Portfolio" subtitle={subtitle} tabs={tabs} primaryAction={brokerList.length ? <RecordButton /> : undefined} />;

  let body: React.ReactNode;
  if (!brokerList.length && tab !== 'brokers') {
    body = (
      <EmptyState
        title="Start with your broker"
        body="1. Add your broker and the fees it charges. 2. Record a deposit. 3. Record what you bought."
        actions={<AddBrokerButton variant="primary" />}
      />
    );
  } else if (tab === 'overview') {
    const l = liquidation && liquidation.ok ? liquidation.data : null;
    const f = flows && flows.ok ? flows.data : [];
    const nothing = v && !v.holdings.length && !v.cash.some((c) => c.balanceCents !== 0) && f.every((m) => !m.depositedCents && !m.withdrawnCents && !m.boughtCents && !m.soldCents);
    body =
      !v || !l || nothing ? (
        <EmptyState title="No investments recorded yet" body="Record a deposit to your broker, then what you bought with it." actions={<RecordButton variant="secondary" />} />
      ) : (
        <PortfolioOverview valuation={v} liquidation={l} flows={f} brokers={brokerList} timeZone={timeZone} now={now} />
      );
  } else if (tab === 'transactions') {
    const list = investments && investments.ok ? investments.data : [];
    const brokerName = (id: string) => brokerList.find((b) => b.id === id)?.name ?? '—';
    body = !list.length ? (
      <EmptyState title="No investments recorded yet" body="Every deposit, buy, sell, and withdrawal you record appears here." actions={<RecordButton variant="secondary" />} />
    ) : (
      <Section>
        <DataTable
          caption="Investment transactions"
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'type', label: 'Type' },
            { key: 'broker', label: 'Broker' },
            { key: 'holding', label: 'Holding' },
            { key: 'units', label: 'Units', align: 'right' },
            { key: 'amount', label: 'Amount', align: 'right' },
            { key: 'fee', label: 'Fee', align: 'right' },
            { key: 'edit', label: '' },
          ]}
          rows={list.map((t) => ({
            _key: t.id,
            date: formatDay(t.localDate, currentYear),
            type: <Badge label={TYPE_LABEL[t.type]} />,
            broker: brokerName(t.brokerId),
            holding: t.ticker ?? '—',
            units: t.quantityMicro ? formatQuantity(t.quantityMicro) : '',
            amount: formatMoney(t.type === 'BUY' || t.type === 'SELL' ? t.grossCents : t.amountCents),
            fee: (
              <span className="inline-flex items-center gap-1">
                {formatMoney(t.commissionCents)}
                {t.commissionSource === 'manual' ? <Badge label="edited" /> : null}
              </span>
            ),
            edit: <CorrectButton tx={t} />,
          }))}
        />
      </Section>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        <div>
          <AddBrokerButton />
        </div>
        {!brokerList.length ? (
          <EmptyState title="Start with your broker" body="1. Add your broker and the fees it charges. 2. Record a deposit. 3. Record what you bought." />
        ) : (
          brokerList.map((b) => (
            <Section key={b.id} title={b.name} action={<EditFeesButton broker={b} />}>
              <DataTable
                caption={`${b.name} fees`}
                columns={[
                  { key: 'fee', label: 'Fee' },
                  { key: 'flat', label: 'Flat amount', align: 'right' },
                  { key: 'pct', label: 'Percent', align: 'right' },
                ]}
                rows={FEE_ROWS.map((r) => {
                  const f = getFee(b.fees, r.key);
                  return { _key: r.key, fee: r.label, flat: formatMoney(f.flatCents), pct: formatBps(f.percentBps) };
                })}
              />
            </Section>
          ))
        )}
      </div>
    );
  }

  return (
    <PortfolioDialogs brokers={brokerList} holdings={v?.holdings ?? []} today={today}>
      {header}
      {body}
    </PortfolioDialogs>
  );
}
