'use client';

import {
  FeeCalculator,
  feeFor,
  formatQuantity,
  formatUsd,
  parseAmountInput,
  parseQuantityInput,
  type AssetClass,
  type Broker,
  type FeeSuggestion,
  type Holding,
  type InvestmentType,
  type NewInvestmentInput,
} from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { quote as quoteAction, recordInvestment } from '@/app/actions/investments';

const TABS: [InvestmentType, string][] = [
  ['DEPOSIT', 'Deposit'],
  ['BUY', 'Buy'],
  ['SELL', 'Sell'],
  ['WITHDRAWAL', 'Withdrawal'],
];

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
const cents = (n: number) => (n / 100).toFixed(2);

/**
 * InvestmentForm (07-S01, 07-S04): one tab per type, live commission suggestion
 * from the broker's fee schedule using the same `FeeCalculator` as the API.
 */
export function InvestmentForm({ brokers, holdings }: { brokers: Broker[]; holdings: Holding[] }) {
  const router = useRouter();
  const [type, setType] = useState<InvestmentType>('DEPOSIT');
  const [brokerId, setBrokerId] = useState(brokers[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(''); // deposit / withdrawal
  const [arrivedMode, setArrivedMode] = useState(false);
  const [ticker, setTicker] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('SECURITY');
  const [units, setUnits] = useState('');
  const [gross, setGross] = useState('');
  const [name, setName] = useState('');
  const [quoteInfo, setQuoteInfo] = useState<string | null>(null);
  const [quotePrice, setQuotePrice] = useState<number | null>(null);
  const [commission, setCommission] = useState('');
  const [feeEdited, setFeeEdited] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const broker = brokers.find((b) => b.id === brokerId);
  const sellHolding = holdings.find((h) => h.brokerId === brokerId && h.ticker === ticker);
  const effectiveClass: AssetClass = type === 'SELL' ? sellHolding?.assetClass ?? 'SECURITY' : assetClass;

  /** The amount the fee is computed on, and the amount sent for a deposit typed as "arrived". */
  function base(): { baseCents: number | null; sentCents: number | null } {
    if (type === 'DEPOSIT' || type === 'WITHDRAWAL') {
      const typed = parseAmountInput(amount);
      if (!typed || !broker) return { baseCents: null, sentCents: null };
      if (type === 'DEPOSIT' && arrivedMode) {
        const sent = FeeCalculator.grossUp(broker.fees.deposit, typed);
        return { baseCents: sent, sentCents: sent };
      }
      return { baseCents: typed, sentCents: typed };
    }
    return { baseCents: parseAmountInput(gross), sentCents: null };
  }

  const { baseCents, sentCents } = base();
  const suggestion: FeeSuggestion | null =
    broker && baseCents ? FeeCalculator.suggest(broker, type, type === 'BUY' || type === 'SELL' ? effectiveClass : null, baseCents) : null;
  const shownCommission = feeEdited ? commission : suggestion ? cents(suggestion.commissionCents) : '';

  function resetFor(next: InvestmentType) {
    setType(next);
    setMessage(null); // a deposit never shows a buy's cost-basis line
    setFeeEdited(false);
    setCommission('');
    setQuoteInfo(null);
  }

  async function onTickerBlur() {
    if (!ticker.trim() || type !== 'BUY') return;
    const r = await quoteAction(ticker);
    if (!r.ok) {
      setQuotePrice(null);
      setQuoteInfo(r.status === 404 ? r.error : `${r.error} You can still save.`);
      return;
    }
    const q = r.data;
    setTicker(q.symbol);
    setAssetClass(q.assetClass);
    setName(q.name);
    setQuotePrice(q.priceMicros ?? null);
    setQuoteInfo(`${q.name} · ${q.instrumentType} · $${q.price} at ${new Date(q.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
    const qty = parseQuantityInput(units);
    if (qty && q.priceMicros) setGross(cents(Math.round((qty * q.priceMicros) / 1e10)));
  }

  function onUnitsChange(value: string) {
    setUnits(value);
    const qty = parseQuantityInput(value);
    if (type === 'BUY' && qty && quotePrice) setGross(cents(Math.round((qty * quotePrice) / 1e10)));
  }

  async function submit() {
    if (!broker) return;
    const commissionCents = feeEdited ? parseAmountInput(commission || '0') ?? undefined : undefined;
    if (feeEdited && commissionCents === undefined) return setMessage({ ok: false, text: 'The commission is not a valid amount.' });
    let input: NewInvestmentInput;
    if (type === 'DEPOSIT' || type === 'WITHDRAWAL') {
      if (!sentCents) return setMessage({ ok: false, text: 'Enter an amount.' });
      input = { type, brokerId, localDate: date, amountCents: sentCents, commissionCents, name: null };
    } else {
      const quantityMicro = parseQuantityInput(units);
      const grossCents = parseAmountInput(gross);
      if (!ticker || !quantityMicro || !grossCents) return setMessage({ ok: false, text: 'Enter the ticker, units, and gross value.' });
      input =
        type === 'BUY'
          ? { type, brokerId, localDate: date, ticker, assetClass, quantityMicro, grossCents, commissionCents, name: name || null }
          : { type, brokerId, localDate: date, ticker, quantityMicro, grossCents, commissionCents, name: null };
    }
    setPending(true);
    const r = await recordInvestment(input);
    setPending(false);
    if (!r.ok) return setMessage({ ok: false, text: r.error });
    const tx = r.data.transaction;
    const fee = formatUsd(tx.commissionCents);
    let text = '';
    if (tx.type === 'DEPOSIT') text = `Deposit saved: ${formatUsd(tx.amountCents!)} sent, ${fee} fee, ${formatUsd(r.data.cashDeltaCents)} now in cash at ${broker.name}.`;
    if (tx.type === 'WITHDRAWAL')
      text = `Withdrawal saved: ${formatUsd(tx.amountCents!)} taken out, ${fee} fee, ${formatUsd(tx.amountCents! - tx.commissionCents)} reaches your bank.`;
    if (tx.type === 'BUY' && r.data.holding)
      text = `${tx.ticker}: ${formatQuantity(r.data.holding.quantityMicro)} units, cost basis ${formatUsd(r.data.holding.costBasisCents)} including ${fee} in fees.`;
    if (tx.type === 'SELL') text = `Sale saved: ${formatUsd(tx.grossCents!)} gross, ${fee} fee, realized gain ${formatUsd(tx.realizedGainCents ?? 0)}.`;
    setMessage({ ok: true, text });
    setAmount('');
    setUnits('');
    setGross('');
    setFeeEdited(false);
    router.refresh();
  }

  return (
    <div className="card">
      <h2>Record an investment transaction</h2>
      <div className="tabs">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" className={type === t ? 'active' : ''} onClick={() => resetFor(t)}>
            {label}
          </button>
        ))}
      </div>
      <div className="row">
        <div>
          <label htmlFor="inv-broker">Broker</label>
          <select id="inv-broker" value={brokerId} onChange={(e) => setBrokerId(e.target.value)}>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="inv-date">Date</label>
          <input id="inv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {(type === 'DEPOSIT' || type === 'WITHDRAWAL') && (
        <div className="row">
          {type === 'DEPOSIT' && (
            <div>
              <label htmlFor="inv-mode">I know</label>
              <select id="inv-mode" value={arrivedMode ? 'arrived' : 'sent'} onChange={(e) => setArrivedMode(e.target.value === 'arrived')}>
                <option value="sent">the amount sent from the bank</option>
                <option value="arrived">the amount that arrived at the broker</option>
              </select>
            </div>
          )}
          <div>
            <label htmlFor="inv-amount">{type === 'WITHDRAWAL' ? 'Amount taken out of the broker (USD)' : arrivedMode ? 'Amount that arrived (USD)' : 'Amount sent (USD)'}</label>
            <input id="inv-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
      )}

      {(type === 'BUY' || type === 'SELL') && (
        <>
          <div className="row">
            <div>
              <label htmlFor="inv-ticker">{type === 'SELL' ? 'Holding' : 'Ticker (as shown on Yahoo Finance, e.g. VT, BTC-USD, VWRA.L)'}</label>
              {type === 'SELL' ? (
                <select id="inv-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)}>
                  <option value="">Choose…</option>
                  {holdings
                    .filter((h) => h.brokerId === brokerId && h.quantityMicro > 0)
                    .map((h) => (
                      <option key={h.ticker} value={h.ticker}>
                        {h.ticker} ({formatQuantity(h.quantityMicro)} units)
                      </option>
                    ))}
                </select>
              ) : (
                <input id="inv-ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onBlur={onTickerBlur} />
              )}
            </div>
            {type === 'BUY' && (
              <div>
                <label htmlFor="inv-class">Asset class</label>
                <select id="inv-class" value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
                  <option value="SECURITY">Stocks and ETFs</option>
                  <option value="CRYPTO">Crypto</option>
                </select>
              </div>
            )}
          </div>
          {quoteInfo && <p className="muted">{quoteInfo}</p>}
          <div className="row">
            <div>
              <label htmlFor="inv-units">Units</label>
              <input id="inv-units" inputMode="decimal" value={units} onChange={(e) => onUnitsChange(e.target.value)} />
            </div>
            <div>
              <label htmlFor="inv-gross">Gross value, units × price (USD)</label>
              <input id="inv-gross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} />
            </div>
          </div>
        </>
      )}

      <div className="row">
        <div>
          <label htmlFor="inv-fee">Commission (USD)</label>
          <input
            id="inv-fee"
            inputMode="decimal"
            value={shownCommission}
            onChange={(e) => {
              setFeeEdited(true);
              setCommission(e.target.value);
            }}
          />
        </div>
      </div>
      {suggestion && broker && (
        <p className="muted">
          {suggestion.explanation}
          {feeEdited ? ' (you changed the commission; it will be saved as typed)' : ''}
          {type === 'DEPOSIT' && sentCents ? ` · ${formatUsd(sentCents)} sent, ${formatUsd(sentCents - (feeEdited ? parseAmountInput(commission || '0') ?? 0 : suggestion.commissionCents))} arrives at ${broker.name}` : ''}
          {type === 'DEPOSIT' && arrivedMode && sentCents ? ` (fee ${feeFor(broker.fees, 'DEPOSIT').percentBps / 100}% grossed up)` : ''}
        </p>
      )}
      {message && <p className={message.ok ? 'ok' : 'error'}>{message.text}</p>}
      <button type="button" disabled={pending || !broker} onClick={submit}>
        {pending ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
