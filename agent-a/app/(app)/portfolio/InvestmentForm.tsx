'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { HoldingValue, Quote } from '@/shared/api-types';
import { FeeCalculator, feeFor } from '@/shared/fee-calculator';
import { formatMoney } from '@/shared/money';
import type { AssetClass, Broker, InvestmentTransaction, InvestmentType } from '@/shared/types';
import { correctInvestment, quote as lookupQuote, recordInvestment } from '../../actions/investment-actions';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { centsToInput, formatQuantity, parseAmountInput, parseQuantityInput } from '../../ui/format';
import { FormField, inputClass } from '../../ui/FormField';
import { useToast } from '../../ui/Toast';

const TYPES: Array<{ value: InvestmentType; label: string }> = [
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
  { value: 'WITHDRAWAL', label: 'Withdrawal' },
];

/**
 * Record or correct an investment transaction (07-S01, 07-S04). The fee is suggested with the
 * shared FeeCalculator on every change; once the user edits it, the suggestion stops
 * overwriting it and the request sends commissionCents.
 */
export function InvestmentForm({
  open,
  correcting,
  brokers,
  holdings,
  today,
  onClose,
}: {
  open: boolean;
  correcting: InvestmentTransaction | null;
  brokers: Broker[];
  holdings: HoldingValue[];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<InvestmentType>('DEPOSIT');
  const [brokerId, setBrokerId] = useState('');
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [depositMode, setDepositMode] = useState<'sent' | 'arrived'>('sent');
  const [ticker, setTicker] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('SECURITY');
  const [units, setUnits] = useState('');
  const [gross, setGross] = useState('');
  const [fee, setFee] = useState('');
  const [feeEdited, setFeeEdited] = useState(false);
  const [name, setName] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteMsg, setQuoteMsg] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = correcting;
    setType(c?.type ?? 'DEPOSIT');
    setBrokerId(c?.brokerId ?? brokers[0]?.id ?? '');
    setDate(c?.localDate ?? today);
    setAmount(c && (c.type === 'DEPOSIT' || c.type === 'WITHDRAWAL') ? centsToInput(c.amountCents) : '');
    setDepositMode('sent');
    setTicker(c?.ticker ?? '');
    setAssetClass(c?.assetClass ?? 'SECURITY');
    setUnits(c && c.quantityMicro ? formatQuantity(c.quantityMicro) : '');
    setGross(c && c.grossCents ? centsToInput(c.grossCents) : '');
    setFee(c ? centsToInput(c.commissionCents) : '');
    setFeeEdited(Boolean(c && c.commissionSource === 'manual'));
    setName(c?.name ?? '');
    setQuote(null);
    setQuoteMsg(null);
    setFields({});
    setError(null);
  }, [open, correcting, brokers, today]);

  const broker = brokers.find((b) => b.id === brokerId) ?? null;
  const isTrade = type === 'BUY' || type === 'SELL';

  /** The amounts the fee applies to, and the suggestion for them. */
  const calc = useMemo(() => {
    if (!broker) return null;
    const entered = parseAmountInput(isTrade ? gross : amount);
    if (!entered) return null;
    if (type === 'DEPOSIT' && depositMode === 'arrived' && !correcting) {
      const f = feeFor(broker, 'DEPOSIT');
      const sent = FeeCalculator.grossUp(f, entered);
      const s = FeeCalculator.suggest(broker, 'DEPOSIT', null, sent);
      return { base: sent, suggestion: { ...s, commissionCents: sent - entered, netCents: entered } };
    }
    return { base: entered, suggestion: FeeCalculator.suggest(broker, type, isTrade ? assetClass : null, entered) };
  }, [broker, gross, amount, type, depositMode, assetClass, isTrade, correcting]);

  // recalculate(): the suggestion fills the fee field until the user edits it.
  useEffect(() => {
    if (!feeEdited) setFee(calc ? centsToInput(calc.suggestion.commissionCents) : '');
  }, [calc, feeEdited]);

  const onTickerBlur = async () => {
    if (!ticker.trim() || type !== 'BUY') return;
    setQuoteMsg('Looking up the price…');
    const r = await lookupQuote(ticker);
    if (!r.ok) {
      setQuote(null);
      setQuoteMsg(r.message);
      return;
    }
    setQuote(r.data);
    setQuoteMsg(null);
    setTicker(r.data.symbol);
    setAssetClass(r.data.assetClass);
    const q = parseQuantityInput(units);
    if (q) setGross(centsToInput(Math.round((q * r.data.priceMicros) / 1e10)));
  };

  const onUnitsChange = (v: string) => {
    setUnits(v);
    const q = parseQuantityInput(v);
    if (q && quote && type === 'BUY') setGross(centsToInput(Math.round((q * quote.priceMicros) / 1e10)));
  };

  const sellable = holdings.filter((h) => h.holding.brokerId === brokerId && h.holding.quantityMicro > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFields({});
    if (!calc || !broker) return setFields({ amount: 'Enter an amount' });
    const commissionCents = feeEdited ? parseAmountInput(fee) ?? (fee.trim() === '0' || fee.trim() === '0.00' ? 0 : NaN) : undefined;
    if (commissionCents !== undefined && Number.isNaN(commissionCents)) return setFields({ commissionCents: 'Enter the fee in dollars, or 0' });
    const quantityMicro = isTrade ? parseQuantityInput(units) : null;
    if (isTrade && !quantityMicro) return setFields({ quantityMicro: 'Enter the number of units, for example 0.6533' });
    setPending(true);
    const r = correcting
      ? await correctInvestment(correcting.id, {
          version: correcting.version,
          ...(isTrade ? { quantityMicro, grossCents: calc.base } : { amountCents: calc.base }),
          ...(feeEdited ? { commissionCents } : correcting.commissionSource === 'manual' ? { commissionCents: null } : {}),
          name: name || null,
        })
      : await recordInvestment({
          type,
          brokerId,
          localDate: date,
          name: name || (type === 'BUY' ? (quote?.name ?? null) : null),
          ...(isTrade ? { ticker, assetClass, quantityMicro, grossCents: calc.base } : { amountCents: calc.base }),
          ...(feeEdited ? { commissionCents } : {}),
        });
    setPending(false);
    if (!r.ok) {
      setFields(r.fields ?? {});
      if (!r.fields) setError(r.message);
      return;
    }
    const tx = 'transaction' in (r.data as object) ? (r.data as { transaction: InvestmentTransaction }).transaction : (r.data as InvestmentTransaction);
    const f = tx.commissionCents;
    const msg = correcting
      ? 'Transaction corrected'
      : tx.type === 'DEPOSIT'
        ? `Deposit saved: ${formatMoney(tx.amountCents)} sent, ${formatMoney(f)} fee, ${formatMoney(tx.amountCents - f)} now in cash at ${broker.name}`
        : tx.type === 'BUY'
          ? `${tx.ticker}: ${formatQuantity(tx.quantityMicro)} units, cost ${formatMoney(tx.grossCents + f)} including ${formatMoney(f)} in fees`
          : tx.type === 'SELL'
            ? `${tx.ticker}: sold ${formatQuantity(tx.quantityMicro)} units for ${formatMoney(tx.grossCents)}, ${formatMoney(f)} in fees`
            : `Withdrawal saved: ${formatMoney(tx.amountCents)} taken out, ${formatMoney(f)} fee, ${formatMoney(tx.amountCents - f)} reaches your bank`;
    toast.show(msg);
    onClose();
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      title={correcting ? 'Correct a transaction' : 'Record a transaction'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="investment-form" pending={pending} disabled={!brokers.length}>
            Save
          </Button>
        </>
      }
    >
      {!brokers.length ? (
        <p className="text-sm">Add your broker and its fees first, on the Brokers and fees tab.</p>
      ) : (
        <form id="investment-form" onSubmit={submit} className="flex flex-col gap-4">
          {!correcting ? (
            <div role="tablist" aria-label="Type" className="grid grid-cols-4 gap-1">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={type === t.value}
                  onClick={() => {
                    setType(t.value);
                    setFeeEdited(false);
                  }}
                  className={`h-11 rounded-[6px] border text-sm sm:h-9 ${type === t.value ? 'border-accent bg-accent text-white' : 'border-border bg-surface'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              {TYPES.find((t) => t.value === type)?.label} {correcting.ticker ?? ''} on {correcting.localDate}
            </p>
          )}
          {!correcting ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Broker" error={fields.brokerId}>
                {({ id }) => (
                  <select id={id} className={inputClass} value={brokerId} onChange={(e) => { setBrokerId(e.target.value); setFeeEdited(false); }}>
                    {brokers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="Date" error={fields.localDate}>
                {({ id }) => <input id={id} type="date" max={today} className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />}
              </FormField>
            </div>
          ) : null}

          {type === 'DEPOSIT' && !correcting ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Which amount do you know?</legend>
              {(['sent', 'arrived'] as const).map((m) => (
                <label key={m} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
                  <input type="radio" name="deposit-mode" checked={depositMode === m} onChange={() => { setDepositMode(m); setFeeEdited(false); }} />
                  {m === 'sent' ? 'The amount I sent from my bank' : `The amount that arrived at ${broker?.name ?? 'the broker'}`}
                </label>
              ))}
            </fieldset>
          ) : null}

          {type === 'BUY' && !correcting ? (
            <FormField label="Ticker" hint="As shown on Yahoo Finance, for example VT, BTC-USD, VWRA.L" error={fields.ticker ?? quoteMsg}>
              {({ id, describedBy }) => (
                <input id={id} className={inputClass} required autoCapitalize="characters" placeholder="VT" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onBlur={onTickerBlur} aria-describedby={describedBy} />
              )}
            </FormField>
          ) : null}
          {quote && type === 'BUY' ? (
            <p className="text-sm">
              {quote.name ?? quote.symbol} · {quote.instrumentType ?? 'Instrument'} · {formatMoney(Math.round(quote.priceMicros / 10_000))} per unit
            </p>
          ) : null}
          {type === 'SELL' && !correcting ? (
            <FormField label="Holding" error={fields.ticker}>
              {({ id }) => (
                <select
                  id={id}
                  className={inputClass}
                  required
                  value={ticker}
                  onChange={(e) => {
                    const h = sellable.find((x) => x.holding.ticker === e.target.value);
                    setTicker(e.target.value);
                    if (h) setAssetClass(h.holding.assetClass);
                  }}
                >
                  <option value="" disabled>
                    {sellable.length ? 'Choose a holding' : 'No holdings at this broker'}
                  </option>
                  {sellable.map((h) => (
                    <option key={h.holding.ticker} value={h.holding.ticker}>
                      {h.holding.ticker} · {formatQuantity(h.holding.quantityMicro)} units
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          ) : null}
          {type === 'BUY' && !correcting ? (
            <FormField label="Asset class">
              {({ id }) => (
                <select id={id} className={inputClass} value={assetClass} onChange={(e) => { setAssetClass(e.target.value as AssetClass); setFeeEdited(false); }}>
                  <option value="SECURITY">Stocks and ETFs</option>
                  <option value="CRYPTO">Crypto</option>
                </select>
              )}
            </FormField>
          ) : null}

          {isTrade ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Units" error={fields.quantityMicro}>
                {({ id, describedBy, invalid }) => <input id={id} className={inputClass} inputMode="decimal" required placeholder="0.6533" value={units} onChange={(e) => onUnitsChange(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
              </FormField>
              <FormField label="Gross value (USD)" error={fields.grossCents}>
                {({ id, describedBy, invalid }) => <input id={id} className={inputClass} inputMode="decimal" required placeholder="101.22" value={gross} onChange={(e) => { setGross(e.target.value); }} aria-describedby={describedBy} aria-invalid={invalid} />}
              </FormField>
            </div>
          ) : (
            <FormField label={type === 'WITHDRAWAL' ? 'Amount taken out (USD)' : 'Amount (USD)'} error={fields.amountCents ?? fields.amount}>
              {({ id, describedBy, invalid }) => <input id={id} className={inputClass} inputMode="decimal" required placeholder="300.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
            </FormField>
          )}

          <FormField label="Fee (USD)" hint={calc ? calc.suggestion.explanation : 'Enter an amount to see the fee.'} error={fields.commissionCents}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                className={inputClass}
                inputMode="decimal"
                value={fee}
                onChange={(e) => {
                  setFee(e.target.value);
                  setFeeEdited(true);
                }}
                aria-describedby={describedBy}
                aria-invalid={invalid}
              />
            )}
          </FormField>
          {type === 'DEPOSIT' && calc && broker ? (
            <p className="-mt-2 text-[13px] text-text-secondary">
              {depositMode === 'arrived' && !correcting
                ? `${formatMoney(calc.base)} sent from your bank`
                : `${formatMoney(calc.base - (parseAmountInput(fee) ?? 0))} arrives at ${broker.name}`}
            </p>
          ) : null}
          {feeEdited && calc ? (
            <button type="button" className="-mt-2 self-start text-[13px] text-accent underline" onClick={() => setFeeEdited(false)}>
              Use the suggested fee
            </button>
          ) : null}
          <FormField label="Name (optional)" hint="Shown under the ticker. Filled from Yahoo Finance when you buy.">
            {({ id }) => <input id={id} className={inputClass} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}
          </FormField>
          {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
        </form>
      )}
    </Dialog>
  );
}
