'use client';

import { formatQuantity, formatUsd, type Broker, type InvestmentTransaction, type Liquidation, type Price, type Valuation } from '@finance/shared';
import { useState } from 'react';
import { InvestmentCorrection } from './investment-correction';

function age(iso?: string | null): string {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

function time(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' }) : '';
}

/** Why a holding has no price (07-S02). */
function missingReason(ticker: string, price: Price | null): string {
  switch (price?.lastError) {
    case 'NOT_FOUND':
      return `${ticker} is not a Yahoo Finance ticker`;
    case 'UNSUPPORTED_CURRENCY':
      return `prices in ${price.nativeCurrency ?? 'this currency'} are not supported`;
    default:
      return 'price service unavailable, retrying';
  }
}

/** Holdings at market prices (07-S02) and "if I sold everything today" (07-S05). */
export function PortfolioView({
  valuation,
  liquidation,
  brokers,
  investments,
}: {
  valuation: Valuation | null;
  liquidation: Liquidation | null;
  brokers: Broker[];
  investments: InvestmentTransaction[];
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const brokerName = (id: string) => brokers.find((b) => b.id === id)?.name ?? id;
  if (!valuation) return null;
  return (
    <>
      {valuation.cash
        .filter((c) => c.balanceCents < 0)
        .map((c) => (
          <div key={c.brokerId} className="banner warn">
            Cash at {brokerName(c.brokerId)} is {formatUsd(c.balanceCents)}: record the deposits that paid for these buys.
          </div>
        ))}
      <div className="card">
        <h2>Holdings</h2>
        {valuation.holdings.length === 0 ? (
          <p className="muted">No holdings yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Broker</th>
                <th className="num">Units</th>
                <th className="num">Cost basis</th>
                <th className="num">Price</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {valuation.holdings.map((h) => (
                <tr key={`${h.holding.brokerId}-${h.holding.ticker}`}>
                  <td>
                    {h.holding.ticker}
                    <div className="muted">{h.holding.name}</div>
                  </td>
                  <td>{brokerName(h.holding.brokerId)}</td>
                  <td className="num">{formatQuantity(h.holding.quantityMicro)}</td>
                  <td className="num">{formatUsd(h.holding.costBasisCents)}</td>
                  <td className="num">
                    {h.price?.priceMicros ? (
                      <>
                        ${(h.price.priceMicros / 1e6).toFixed(h.price.priceMicros < 1e6 ? 6 : 2)}
                        <div className={h.stale ? 'warn' : 'muted'}>{h.stale ? `price from ${age(h.price.retrievedAt)}` : `price ${time(h.price.marketTime ?? h.price.retrievedAt)}`}</div>
                      </>
                    ) : (
                      <span className="warn">{missingReason(h.holding.ticker, h.price)}</span>
                    )}
                  </td>
                  <td className="num">{h.marketValueCents !== null ? formatUsd(h.marketValueCents) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          Total of priced holdings: <strong>{formatUsd(valuation.totalValueCents)}</strong>
          {valuation.unpriced.length > 0 && <span className="muted"> (not included: {valuation.unpriced.join(', ')})</span>}
        </p>
        <p className="muted">
          Cash: {valuation.cash.map((c) => `${brokerName(c.brokerId)} ${formatUsd(c.balanceCents)}`).join(' · ') || 'none'}
        </p>
      </div>

      {liquidation && liquidation.brokers.length > 0 && (
        <div className="card">
          <h2>If I sold everything today</h2>
          <p>
            You would receive <strong>{formatUsd(liquidation.totalCents)}</strong>
            {liquidation.priceTime ? ` (prices from ${time(liquidation.priceTime)})` : ''}, before taxes. This is an estimate, not a
            recommendation.
          </p>
          {liquidation.brokers.map((b) => (
            <div key={b.brokerId}>
              <h3>{b.brokerName}</h3>
              <table>
                <tbody>
                  {b.holdings.map((h) => (
                    <tr key={h.ticker}>
                      <td>{h.ticker}</td>
                      <td className="num">{formatUsd(h.marketValueCents)}</td>
                      <td>− {formatUsd(h.sellFeeCents)} ({h.sellFeeExplained})</td>
                      <td className="num">{formatUsd(h.netCents)}</td>
                      <td className="num muted">gain {formatUsd(h.unrealizedGainCents)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Cash</td>
                    <td />
                    <td />
                    <td className="num">{formatUsd(b.cashCents)}</td>
                    <td>{b.negativeCash && <span className="warn">negative cash</span>}</td>
                  </tr>
                  <tr>
                    <td>Withdrawal</td>
                    <td className="num">{formatUsd(b.proceedsCents)}</td>
                    <td>− {formatUsd(b.withdrawalFeeCents)} ({b.withdrawalFeeExplained})</td>
                    <td className="num">
                      <strong>{formatUsd(b.netToBankCents)}</strong>
                    </td>
                    <td className="muted">to your bank</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <button type="button" className="secondary" onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? 'Hide' : 'Show'} investment transactions ({investments.length})
        </button>
        {showHistory && (
          <table style={{ marginTop: '0.6rem' }}>
            <tbody>
              {investments.map((t) => (
                <tr key={t.id}>
                  <td>{t.localDate}</td>
                  <td>{t.type}</td>
                  <td>{brokerName(t.brokerId)}</td>
                  <td>{t.ticker ?? ''}</td>
                  <td className="num">{t.quantityMicro ? formatQuantity(t.quantityMicro) : ''}</td>
                  <td className="num">{formatUsd(t.grossCents ?? t.amountCents ?? 0)}</td>
                  <td className="num">
                    fee {formatUsd(t.commissionCents)} <span className="muted">({t.commissionSource})</span>
                  </td>
                  <td>
                    {editing === t.id ? (
                      <InvestmentCorrection tx={t} onDone={() => setEditing(null)} />
                    ) : (
                      <button type="button" className="secondary" onClick={() => setEditing(t.id)}>
                        Correct
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
