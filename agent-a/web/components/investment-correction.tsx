'use client';

import { formatQuantity, parseAmountInput, parseQuantityInput, type InvestmentTransaction } from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { correctInvestment } from '@/app/actions/investments';

/** Corrects a recorded investment transaction; the holding is rebuilt from its trades (07-S01). */
export function InvestmentCorrection({ tx, onDone }: { tx: InvestmentTransaction; onDone: () => void }) {
  const router = useRouter();
  const trade = tx.type === 'BUY' || tx.type === 'SELL';
  const [units, setUnits] = useState(tx.quantityMicro ? formatQuantity(tx.quantityMicro) : '');
  const [amount, setAmount] = useState(((trade ? tx.grossCents : tx.amountCents) ?? 0) / 100 + '');
  const [fee, setFee] = useState((tx.commissionCents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const changes: Record<string, number> = { version: tx.version };
    const cents = parseAmountInput(amount);
    if (!cents) return setError('Enter a valid amount.');
    if (trade) {
      const qty = parseQuantityInput(units);
      if (!qty) return setError('Enter valid units.');
      if (qty !== tx.quantityMicro) changes.quantityMicro = qty;
      if (cents !== tx.grossCents) changes.grossCents = cents;
    } else if (cents !== tx.amountCents) changes.amountCents = cents;
    const feeCents = parseAmountInput(fee || '0') ?? (fee.trim() === '0' ? 0 : null);
    if (feeCents === null) return setError('Enter a valid commission.');
    if (feeCents !== tx.commissionCents) changes.commissionCents = feeCents;
    if (Object.keys(changes).length === 1) return onDone();
    const r = await correctInvestment(tx.id, changes as never);
    if (!r.ok) return setError(r.error);
    onDone();
    router.refresh();
  }

  return (
    <div className="row">
      {trade && (
        <div>
          <label>Units</label>
          <input value={units} onChange={(e) => setUnits(e.target.value)} />
        </div>
      )}
      <div>
        <label>{trade ? 'Gross value (USD)' : 'Amount (USD)'}</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div>
        <label>Commission (USD)</label>
        <input value={fee} onChange={(e) => setFee(e.target.value)} />
      </div>
      <button type="button" onClick={save} style={{ flex: '0 0 auto' }}>
        Save correction
      </button>
      <button type="button" className="secondary" onClick={onDone} style={{ flex: '0 0 auto' }}>
        Cancel
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
