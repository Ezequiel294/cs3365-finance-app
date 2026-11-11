'use client';

import { emptyFeeSchedule, type Broker, type Fee, type FeeSchedule } from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBroker, updateBroker } from '@/app/actions/investments';

type FeeKey = 'deposit' | 'withdrawal' | 'buy.security' | 'buy.crypto' | 'sell.security' | 'sell.crypto';

const ROWS: [FeeKey, string][] = [
  ['deposit', 'Deposit'],
  ['withdrawal', 'Withdrawal'],
  ['buy.security', 'Buy stocks and ETFs'],
  ['buy.crypto', 'Buy crypto'],
  ['sell.security', 'Sell stocks and ETFs'],
  ['sell.crypto', 'Sell crypto'],
];

function get(fees: FeeSchedule, key: FeeKey): Fee {
  const [a, b] = key.split('.') as [keyof FeeSchedule, 'security' | 'crypto' | undefined];
  return b ? (fees[a] as { security: Fee; crypto: Fee })[b] : (fees[a] as Fee);
}

/** Parses "1.55" into 155 basis points and "0.15" into 15 cents; null when invalid. */
function toBps(text: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(text.trim() || '0')) return null;
  const v = Math.round(Number(text.trim() || '0') * 100);
  return v <= 9999 ? v : null;
}
function toCents(text: string): number | null {
  if (!/^\d+(\.\d{0,2})?$/.test(text.trim() || '0')) return null;
  return Math.round(Number(text.trim() || '0') * 100);
}

/** BrokerFeesForm (07-S03): one row per fee, flat USD and % of amount. */
export function BrokerFeesForm({ brokers }: { brokers: Broker[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(brokers[0]?.id ?? 'new');
  const broker = brokers.find((b) => b.id === selected);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function submit(form: FormData) {
    setError(null);
    setSaved(null);
    const fees = emptyFeeSchedule();
    for (const [key, label] of ROWS) {
      const flat = toCents(String(form.get(`${key}.flat`) ?? ''));
      const pct = toBps(String(form.get(`${key}.pct`) ?? ''));
      if (flat === null || pct === null) return setError(`${label}: enter a flat amount ≥ 0 and a percentage from 0 to 99.99`);
      const fee = get(fees, key);
      fee.flatCents = flat;
      fee.percentBps = pct;
    }
    const result = broker
      ? await updateBroker(broker.id, fees, broker.version)
      : await createBroker(String(form.get('name') ?? '').trim(), fees);
    if (!result.ok) return setError(result.status === 409 ? 'Edited elsewhere meanwhile: reload and try again.' : result.error);
    setSaved(`Saved fees for ${result.data.name}. Past transactions keep the commission they were recorded with.`);
    setSelected(result.data.id);
    router.refresh();
  }

  const fees = broker?.fees ?? emptyFeeSchedule();
  return (
    <form action={submit} className="card" key={broker ? `${broker.id}-${broker.version}` : 'new'}>
      <h2>Broker fees</h2>
      <div className="row">
        <div>
          <label htmlFor="broker-pick">Broker</label>
          <select id="broker-pick" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {brokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
            <option value="new">New broker…</option>
          </select>
        </div>
        {!broker && (
          <div>
            <label htmlFor="broker-name">Name</label>
            <input id="broker-name" name="name" required placeholder="Hapi" />
          </div>
        )}
      </div>
      <table style={{ marginTop: '0.6rem' }}>
        <thead>
          <tr>
            <th>Fee</th>
            <th>Flat (USD)</th>
            <th>% of amount</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([key, label]) => {
            const fee = get(fees, key);
            return (
              <tr key={key}>
                <td>{label}</td>
                <td>
                  <input name={`${key}.flat`} inputMode="decimal" defaultValue={(fee.flatCents / 100).toFixed(2)} />
                </td>
                <td>
                  <input name={`${key}.pct`} inputMode="decimal" defaultValue={(fee.percentBps / 100).toString()} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
      {saved && <p className="ok">{saved}</p>}
      <button type="submit" style={{ marginTop: '0.6rem' }}>
        {broker ? 'Save fees' : 'Create broker'}
      </button>
    </form>
  );
}
