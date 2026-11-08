import { formatQuantity, formatUsd } from "@finance/shared";
import { getLiquidation, getValuation, listBrokers, listInvestments } from "@/actions/investment-actions";
import { BrokerForm, CorrectInvestment, InvestmentForm } from "@/components/investment-forms";
import { ago, shortDate, timeOf, todayIn } from "@/lib/format";

/** 07-S01 to 07-S05: holdings at market prices, what selling would return, brokers, and trades. */
export default async function PortfolioPage() {
  const [valuation, liquidation, brokers, trades] = await Promise.all([getValuation(), getLiquidation(), listBrokers(), listInvestments()]);
  const brokerList = brokers.ok ? brokers.data : [];
  const brokerName = (id: string) => brokerList.find((b) => b.id === id)?.name ?? id;

  return (
    <>
      <h1>Portfolio</h1>
      {!valuation.ok ? (
        <p className="error-text">{valuation.error}</p>
      ) : (
        <div className="card">
          <div className="row between">
            <h3>Holdings at market prices</h3>
            <span className="big" style={{ fontSize: "1.3rem" }}>
              {formatUsd(valuation.data.totalValueCents)}
            </span>
          </div>
          {valuation.data.incomplete && <div className="banner warn">Prices are unavailable for some holdings, so the total leaves them out.</div>}
          {valuation.data.holdings.length === 0 ? (
            <p className="muted">No holdings yet. Record a buy below.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Holding</th>
                  <th className="num">Units</th>
                  <th className="num">Cost basis</th>
                  <th className="num">Price</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {valuation.data.holdings.map(({ holding, price, marketValueCents }) => (
                  <tr key={`${holding.brokerId}-${holding.ticker}`}>
                    <td>
                      <b>{holding.ticker}</b>
                      <div className="muted small">{brokerName(holding.brokerId)}</div>
                    </td>
                    <td className="num">{formatQuantity(holding.quantityMicro)}</td>
                    <td className="num">{formatUsd(holding.costBasisCents)}</td>
                    <td className="num">
                      {price ? (
                        <>
                          {formatUsd(price.priceCents)}
                          <div className={`small ${price.stale ? "warn" : "muted"}`}>
                            {price.stale ? `stale, from ${ago(price.retrievedAt)}` : `price ${timeOf(price.retrievedAt)}`}
                          </div>
                        </>
                      ) : (
                        <span className="warn small">price unavailable</span>
                      )}
                    </td>
                    <td className="num">{marketValueCents !== undefined ? formatUsd(marketValueCents) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {liquidation.ok && (liquidation.data.holdings.length > 0 || liquidation.data.cashCents !== 0) && (
        <div className="card">
          <h3>If I sold everything today</h3>
          <p className="big" style={{ fontSize: "1.2rem" }}>
            You would receive {formatUsd(liquidation.data.totalCents)}
            {liquidation.data.priceTime ? <span className="muted small"> (prices from {timeOf(liquidation.data.priceTime)})</span> : null}, before taxes.
          </p>
          {liquidation.data.incomplete && <p className="warn small">Holdings without a price are left out of this figure.</p>}
          <table>
            <thead>
              <tr>
                <th>Holding</th>
                <th className="num">Market value</th>
                <th className="num">Sell commission</th>
                <th className="num">Net if sold</th>
                <th className="num">Gain vs cost</th>
              </tr>
            </thead>
            <tbody>
              {liquidation.data.holdings.map((h) => (
                <tr key={`${h.brokerId}-${h.ticker}`}>
                  <td>
                    {h.ticker} <span className="muted small">{brokerName(h.brokerId)}</span>
                  </td>
                  <td className="num">{h.marketValueCents !== undefined ? formatUsd(h.marketValueCents) : "—"}</td>
                  <td className="num">{h.sellCommissionCents !== undefined ? formatUsd(h.sellCommissionCents) : "—"}</td>
                  <td className="num">{h.netCents !== undefined ? formatUsd(h.netCents) : "—"}</td>
                  <td className={`num ${(h.unrealizedGainCents ?? 0) < 0 ? "bad" : "good"}`}>{h.unrealizedGainCents !== undefined ? formatUsd(h.unrealizedGainCents) : "—"}</td>
                </tr>
              ))}
              {liquidation.data.cash.map((c) => (
                <tr key={`cash-${c.brokerId}`}>
                  <td>Cash at {brokerName(c.brokerId)}</td>
                  <td className="num" colSpan={3}>
                    {formatUsd(c.balanceCents)}
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">An estimate using each broker&apos;s commission rule. It is not a recommendation to sell.</p>
        </div>
      )}

      <InvestmentForm brokers={brokerList} today={todayIn()} />

      <div className="card">
        <h3>Brokers and commission rules</h3>
        {brokerList.map((b) => (
          <BrokerForm key={`${b.id}-${b.version}`} broker={b} />
        ))}
        <BrokerForm />
      </div>

      {trades.ok && trades.data.length > 0 && (
        <div className="card">
          <h3>Investment transactions</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th className="num">Units</th>
                <th className="num">Amount</th>
                <th className="num">Commission</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {trades.data.slice(0, 50).map((t) => (
                <tr key={t.id}>
                  <td className="small">{shortDate(t.localDate)}</td>
                  <td>
                    {t.type} {t.ticker} <span className="muted small">{brokerName(t.brokerId)}</span>
                  </td>
                  <td className="num">{t.quantityMicro ? formatQuantity(t.quantityMicro) : ""}</td>
                  <td className="num">{formatUsd((t.grossCents ?? t.amountCents) ?? 0)}</td>
                  <td className="num">{formatUsd(t.commissionCents)}</td>
                  <td>
                    <CorrectInvestment key={`${t.id}-${t.version}`} tx={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
