import type { Broker, InvestmentTransaction, Liquidation, Valuation } from '@finance/shared';
import { BrokerFeesForm } from '@/components/broker-fees-form';
import { InvestmentForm } from '@/components/investment-form';
import { PortfolioView } from '@/components/portfolio-view';
import { load } from '@/lib/analytics-loader';
import { safe } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

/** PortfolioPage (07-S01 to 07-S05). */
export default async function PortfolioPage() {
  const [brokers, valuation, liquidation, investments] = await Promise.all([
    safe(load<Broker[]>('/api/brokers', '/portfolio')),
    safe(load<Valuation>('/api/portfolio/valuation', '/portfolio')),
    safe(load<Liquidation>('/api/portfolio/liquidation', '/portfolio')),
    safe(load<InvestmentTransaction[]>('/api/investments/transactions', '/portfolio')),
  ]);
  const brokerList = brokers.data ?? [];
  return (
    <>
      <h1>Portfolio</h1>
      {(brokers.error || valuation.error) && <p className="error">{brokers.error ?? valuation.error}</p>}
      <PortfolioView valuation={valuation.data} liquidation={liquidation.data} brokers={brokerList} investments={investments.data ?? []} />
      {brokerList.length > 0 ? (
        <InvestmentForm brokers={brokerList} holdings={(valuation.data?.holdings ?? []).map((h) => h.holding)} />
      ) : (
        <div className="card muted">Describe your broker and its fees below, then record deposits and buys.</div>
      )}
      <BrokerFeesForm brokers={brokerList} />
    </>
  );
}
