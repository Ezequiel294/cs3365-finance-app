import type { HoldingValue, Liquidation, Valuation } from '@/shared/api-types';
import { formatAge } from '@/shared/dates';
import type { Broker, InvestmentMonthRollup, PriceErrorCode } from '@/shared/types';
import { StatusBadge } from '../../ui/Badge';
import { BarList } from '../../ui/charts/BarList';
import { ChartFrame } from '../../ui/charts/ChartFrame';
import { ColumnChart } from '../../ui/charts/ColumnChart';
import { SegmentedBar, type Segment } from '../../ui/charts/SegmentedBar';
import { DataTable, type Row } from '../../ui/DataTable';
import { Delta } from '../../ui/Delta';
import { Disclosure } from '../../ui/Disclosure';
import { formatDateTime, formatMoney, formatMonth, formatQuantity } from '../../ui/format';
import { Money } from '../../ui/Money';
import { Section, SectionGrid } from '../../ui/Section';
import { StatRow, StatTile } from '../../ui/StatTile';

export function priceReason(code: PriceErrorCode | null | undefined, ticker: string, currency?: string | null): string {
  switch (code) {
    case 'NOT_FOUND':
      return `${ticker} is not a Yahoo Finance ticker`;
    case 'UNSUPPORTED_CURRENCY':
      return `Prices in ${currency ?? 'that currency'} are not supported`;
    default:
      return 'Price service unavailable, retrying';
  }
}

/** Holdings take series slots 1 to 6 in alphabetical order of ticker; past six, "Other". */
function holdingSegments(priced: HoldingValue[]): Segment[] {
  const byTicker = new Map<string, number>();
  for (const h of priced) byTicker.set(h.holding.ticker, (byTicker.get(h.holding.ticker) ?? 0) + h.marketValueCents!);
  const entries = [...byTicker.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length <= 6) return entries.map(([t, v], i) => ({ label: t, valueCents: v, seriesSlot: i + 1 }));
  const keep = [...entries].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0]);
  const kept = entries.filter(([t]) => keep.includes(t)).map(([t, v], i) => ({ label: t, valueCents: v, seriesSlot: i + 1 }));
  const other = entries.filter(([t]) => !keep.includes(t)).reduce((s, [, v]) => s + v, 0);
  return [...kept, { label: 'Other', valueCents: other, seriesSlot: 0 }];
}

export function HoldingsTable({ valuation, brokers, timeZone, now }: { valuation: Valuation; brokers: Broker[]; timeZone: string; now: Date }) {
  const brokerName = (id: string) => brokers.find((b) => b.id === id)?.name ?? '—';
  const rows: Row[] = valuation.holdings.map((h) => ({
    _key: `${h.holding.brokerId}-${h.holding.ticker}`,
    holding: (
      <div>
        <div className="font-medium">{h.holding.ticker}</div>
        {h.holding.name ? <div className="text-[13px] text-text-secondary">{h.holding.name}</div> : null}
      </div>
    ),
    broker: brokerName(h.holding.brokerId),
    units: formatQuantity(h.holding.quantityMicro),
    paid: formatMoney(h.holding.costBasisCents),
    price:
      h.price?.priceMicros != null ? (
        <div>
          <div>{formatMoney(Math.round(h.price.priceMicros / 10_000))}</div>
          <div className="text-[13px] text-text-secondary">{h.priceTime ? formatDateTime(h.priceTime, timeZone) : ''}</div>
          {h.stale && h.price.retrievedAt ? <StatusBadge status="warning" label={`from ${formatAge(h.price.retrievedAt, now)} ago`} /> : null}
        </div>
      ) : (
        <span className="text-[13px] text-text-secondary">{priceReason(h.price?.lastError, h.holding.ticker, h.price?.nativeCurrency)}</span>
      ),
    value: h.marketValueCents != null ? formatMoney(h.marketValueCents) : '—',
    gain: h.unrealizedGainCents != null ? <Delta amountCents={h.unrealizedGainCents} bps={h.gainBps} /> : '—',
  }));
  for (const c of valuation.cash) {
    rows.push({
      _key: `cash-${c.brokerId}`,
      holding: `Cash at ${brokerName(c.brokerId)}`,
      broker: brokerName(c.brokerId),
      units: '',
      paid: '',
      price: '',
      value: <Money cents={c.balanceCents} tone={c.balanceCents < 0 ? 'negative' : undefined} />,
      gain: '',
      _muted: true,
    });
  }
  return (
    <DataTable
      caption="Holdings"
      columns={[
        { key: 'holding', label: 'Holding' },
        { key: 'broker', label: 'Broker' },
        { key: 'units', label: 'Units', align: 'right' },
        { key: 'paid', label: 'Paid', align: 'right' },
        { key: 'price', label: 'Price', align: 'right' },
        { key: 'value', label: 'Value', align: 'right' },
        { key: 'gain', label: 'Gain or loss', align: 'right' },
      ]}
      rows={rows}
    />
  );
}

export function LiquidationSection({ liquidation, timeZone }: { liquidation: Liquidation; timeZone: string }) {
  const priceTime = liquidation.priceTime ? formatDateTime(liquidation.priceTime, timeZone) : 'now';
  return (
    <Section title="If I sold everything today">
      <div>
        <p className="text-[20px] font-semibold">You would receive {formatMoney(liquidation.totalCents)}</p>
        <p className="text-sm text-text-secondary">Prices as of {priceTime}. Before taxes. An estimate, not a recommendation.</p>
      </div>
      {liquidation.brokers.map((b) => (
        <div key={b.brokerId} className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">{b.brokerName}</h3>
          {b.negativeCash ? null : (
            <SegmentedBar
              parts={[
                { label: 'To your bank', valueCents: b.netToBankCents, seriesSlot: 1 },
                { label: 'Selling fees', valueCents: b.sellFeesCents, seriesSlot: 2 },
                { label: 'Withdrawal fee', valueCents: b.withdrawalFeeCents, seriesSlot: 3 },
              ]}
            />
          )}
          <Disclosure summary="How this is calculated">
            <ul className="flex flex-col gap-1 tabular">
              {b.holdings.map((h) => (
                <li key={h.ticker}>
                  {h.ticker}: worth {formatMoney(h.marketValueCents)}, minus {formatMoney(h.sellFeeCents)} ({h.sellFeeExplained}) = {formatMoney(h.netCents)}
                </li>
              ))}
              <li>Cash at {b.brokerName}: {formatMoney(b.cashCents)}</li>
              <li>
                Withdrawal: minus {formatMoney(b.withdrawalFeeCents)} ({b.withdrawalFeeExplained})
              </li>
              <li className="font-semibold">To your bank: {formatMoney(b.netToBankCents)}</li>
            </ul>
          </Disclosure>
        </div>
      ))}
    </Section>
  );
}

function FlowsSection({ flows }: { flows: InvestmentMonthRollup[] }) {
  const firstActive = flows.findIndex((f) => f.depositedCents || f.withdrawnCents || f.boughtCents || f.soldCents || f.commissionsCents);
  const shown = firstActive >= 0 ? flows.slice(firstActive) : [];
  const active = shown.filter((f) => f.depositedCents || f.withdrawnCents || f.boughtCents || f.soldCents || f.commissionsCents).length;
  const deposited = shown.reduce((s, f) => s + f.depositedCents, 0);
  const fees = shown.reduce((s, f) => s + f.commissionsCents, 0);
  return (
    <Section title="What I have put in">
      <ChartFrame
        title="Deposits and withdrawals by month"
        summary={`Fees paid in this period: ${formatMoney(fees)}`}
        legend={[
          { label: 'Deposited', seriesSlot: 1 },
          { label: 'Withdrawn', seriesSlot: 2 },
        ]}
        points={active}
        minPoints={3}
        notEnoughData={`You deposited ${formatMoney(deposited)} and paid ${formatMoney(fees)} in fees so far. A chart appears after three months.`}
        table={{
          columns: [
            { key: 'month', label: 'Month' },
            { key: 'dep', label: 'Deposited', align: 'right' },
            { key: 'wd', label: 'Withdrawn', align: 'right' },
            { key: 'fees', label: 'Fees', align: 'right' },
          ],
          rows: [...shown].reverse().map((f) => ({ _key: f.month, month: formatMonth(f.month), dep: formatMoney(f.depositedCents), wd: formatMoney(f.withdrawnCents), fees: formatMoney(f.commissionsCents) })),
        }}
      >
        <ColumnChart
          months={shown.map((f) => f.month)}
          series={[
            { label: 'Deposited', seriesSlot: 1, valuesCents: shown.map((f) => f.depositedCents) },
            { label: 'Withdrawn', seriesSlot: 2, valuesCents: shown.map((f) => f.withdrawnCents) },
          ]}
        />
      </ChartFrame>
    </Section>
  );
}

/** The Overview tab, in the order of 07-S02a. */
export function PortfolioOverview({
  valuation,
  liquidation,
  flows,
  brokers,
  timeZone,
  now,
}: {
  valuation: Valuation;
  liquidation: Liquidation;
  flows: InvestmentMonthRollup[];
  brokers: Broker[];
  timeZone: string;
  now: Date;
}) {
  const priced = valuation.holdings.filter((h) => h.marketValueCents != null);
  const brokerName = (id: string) => brokers.find((b) => b.id === id)?.name ?? id;
  const brokersWithHoldings = new Set(valuation.holdings.map((h) => h.holding.brokerId)).size;
  const segments = holdingSegments(priced);
  return (
    <>
      <div className="mb-6 flex flex-col gap-2">
        {liquidation.brokers
          .filter((b) => b.negativeCash)
          .map((b) => (
            <p key={b.brokerId} role="status" className="rounded-[8px] border border-warning bg-[#fff6e0] px-4 py-3 text-sm">
              <span aria-hidden="true" className="text-warning">▲ </span>
              Cash at {brokerName(b.brokerId)} is {formatMoney(b.cashCents)}. Record the deposits that paid for these buys.
            </p>
          ))}
        {valuation.unpriced.length ? (
          <p role="status" className="rounded-[8px] border border-warning bg-[#fff6e0] px-4 py-3 text-sm">
            <span aria-hidden="true" className="text-warning">▲ </span>
            {valuation.unpriced.join(', ')} could not be priced and are left out of the totals.
          </p>
        ) : null}
      </div>
      <StatRow>
        <StatTile label="Market value" value={<Money cents={valuation.totalValueCents} />} caption={`${valuation.holdings.length} holdings at ${brokersWithHoldings} brokers`} />
        <StatTile label="Paid, fees included" value={<Money cents={valuation.totalCostBasisCents} />} caption="everything you paid to buy them" />
        <StatTile label="Gain or loss" value={<Delta amountCents={valuation.unrealizedGainCents} bps={valuation.gainBps} />} caption="before selling costs" />
        <StatTile label="If sold today" value={<Money cents={liquidation.totalCents} />} caption="after fees, before taxes" />
      </StatRow>
      <SectionGrid>
        <Section title="What I hold">
          <ChartFrame
            title="Split by holding"
            summary={
              segments.length === 1
                ? `${segments[0]!.label} is your only holding.`
                : segments.length
                  ? `${[...segments].sort((a, b) => b.valueCents - a.valueCents)[0]!.label} is the largest holding.`
                  : 'Nothing is priced yet.'
            }
            points={segments.length}
            minPoints={2}
            notEnoughData={segments.length === 1 ? `${segments[0]!.label} is your only holding.` : 'Nothing is priced yet.'}
          >
            <SegmentedBar
              parts={segments.map((s) => ({
                ...s,
                detail: priced.find((h) => h.holding.ticker === s.label)?.holding.name ?? undefined,
              }))}
            />
          </ChartFrame>
        </Section>
        <Section title="Value against what I paid">
          <ChartFrame
            title="Value and cost of each holding"
            summary={`Worth ${formatMoney(valuation.totalValueCents)} against ${formatMoney(valuation.totalCostBasisCents)} paid.`}
            points={priced.length}
            minPoints={1}
            notEnoughData="Nothing is priced yet."
          >
            <BarList
              maxRows={6}
              tailLabel={(n, c) => `${n} smaller holdings · ${formatMoney(c)}`}
              rows={priced.map((h) => ({
                key: `${h.holding.brokerId}-${h.holding.ticker}`,
                label: h.holding.ticker,
                valueCents: h.marketValueCents!,
                markerCents: h.holding.costBasisCents,
                markerLabel: `Paid ${formatMoney(h.holding.costBasisCents)}`,
                right: <Delta amountCents={h.unrealizedGainCents!} bps={h.gainBps} />,
              }))}
            />
          </ChartFrame>
        </Section>
        <Section title="Holdings" wide>
          <HoldingsTable valuation={valuation} brokers={brokers} timeZone={timeZone} now={now} />
        </Section>
        <LiquidationSection liquidation={liquidation} timeZone={timeZone} />
        <FlowsSection flows={flows} />
      </SectionGrid>
    </>
  );
}
