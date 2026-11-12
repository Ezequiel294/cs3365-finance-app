'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EMPTY_FEE_SCHEDULE } from '@/shared/fee-calculator';
import type { Broker, Fee, FeeSchedule } from '@/shared/types';
import { createBroker, updateBroker } from '../../actions/investment-actions';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { FormField, inputClass } from '../../ui/FormField';
import { useToast } from '../../ui/Toast';

type FeeKey = 'deposit' | 'withdrawal' | 'buy.security' | 'buy.crypto' | 'sell.security' | 'sell.crypto';

export const FEE_ROWS: Array<{ key: FeeKey; label: string }> = [
  { key: 'deposit', label: 'Deposit' },
  { key: 'withdrawal', label: 'Withdrawal' },
  { key: 'buy.security', label: 'Buy stocks and ETFs' },
  { key: 'buy.crypto', label: 'Buy crypto' },
  { key: 'sell.security', label: 'Sell stocks and ETFs' },
  { key: 'sell.crypto', label: 'Sell crypto' },
];

export function getFee(fees: FeeSchedule, key: FeeKey): Fee {
  const [a, b] = key.split('.') as [keyof FeeSchedule, 'security' | 'crypto' | undefined];
  const v = fees[a] as Fee | { security: Fee; crypto: Fee };
  return b ? (v as { security: Fee; crypto: Fee })[b] : (v as Fee);
}

type Draft = Record<FeeKey, { flat: string; pct: string }>;

function toDraft(fees: FeeSchedule): Draft {
  const d = {} as Draft;
  for (const r of FEE_ROWS) {
    const f = getFee(fees, r.key);
    d[r.key] = { flat: (f.flatCents / 100).toFixed(2), pct: (f.percentBps / 100).toString() };
  }
  return d;
}

function parseFee(flat: string, pct: string): Fee | null {
  const flatCents = Math.round(Number(flat || '0') * 100);
  const percentBps = Math.round(Number(pct || '0') * 100);
  if (!Number.isFinite(flatCents) || flatCents < 0 || !Number.isFinite(percentBps) || percentBps < 0 || percentBps > 9999) return null;
  return { flatCents, percentBps };
}

/** A broker's six fees, each a flat amount plus a percentage (07-S03). */
export function BrokerFeesForm({ open, broker, onClose }: { open: boolean; broker: Broker | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<Draft>(toDraft(EMPTY_FEE_SCHEDULE));
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(broker?.name ?? '');
    setDraft(toDraft(broker?.fees ?? EMPTY_FEE_SCHEDULE));
    setError(null);
    setFields({});
  }, [open, broker]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fees = structuredClone(EMPTY_FEE_SCHEDULE) as FeeSchedule;
    for (const r of FEE_ROWS) {
      const f = parseFee(draft[r.key].flat, draft[r.key].pct);
      if (!f) return setError(`${r.label}: use a flat amount of 0 or more and a percentage from 0 to 99.99.`);
      const [a, b] = r.key.split('.') as [keyof FeeSchedule, 'security' | 'crypto' | undefined];
      if (b) (fees[a] as { security: Fee; crypto: Fee })[b] = f;
      else (fees as unknown as Record<string, Fee>)[a] = f;
    }
    setPending(true);
    const res = broker ? await updateBroker(broker.id, fees, broker.version) : await createBroker(name, fees);
    setPending(false);
    if (!res.ok) {
      setFields(res.fields ?? {});
      setError(res.code === 'CONFLICT' ? 'These fees were changed somewhere else. Reload and try again.' : res.fields ? null : res.message);
      return;
    }
    toast.show(broker ? 'Fees saved' : 'Broker added');
    onClose();
    router.refresh();
  };

  const set = (k: FeeKey, part: 'flat' | 'pct', v: string) => setDraft((d) => ({ ...d, [k]: { ...d[k], [part]: v } }));

  return (
    <Dialog
      open={open}
      title={broker ? `${broker.name} fees` : 'Add a broker'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="broker-form" pending={pending}>
            {broker ? 'Save fees' : 'Add broker'}
          </Button>
        </>
      }
    >
      <form id="broker-form" onSubmit={submit} className="flex flex-col gap-4">
        {!broker ? (
          <FormField label="Name" error={fields.name}>
            {({ id, describedBy, invalid }) => <input id={id} className={inputClass} required maxLength={40} placeholder="Hapi" value={name} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />}
          </FormField>
        ) : null}
        <p className="text-[13px] text-text-secondary">Each fee is a flat amount plus a percentage. Leave 0 where the broker charges nothing.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[13px] text-text-secondary">
              <th className="py-1 font-medium">Fee</th>
              <th className="py-1 font-medium">Flat (USD)</th>
              <th className="py-1 font-medium">Percent</th>
            </tr>
          </thead>
          <tbody>
            {FEE_ROWS.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="py-1 pr-2 text-left font-normal">
                  {r.label}
                </th>
                <td className="py-1 pr-2">
                  <input aria-label={`${r.label}, flat amount in USD`} className={inputClass} inputMode="decimal" value={draft[r.key].flat} onChange={(e) => set(r.key, 'flat', e.target.value)} />
                </td>
                <td className="py-1">
                  <input aria-label={`${r.label}, percent`} className={inputClass} inputMode="decimal" value={draft[r.key].pct} onChange={(e) => set(r.key, 'pct', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
      </form>
    </Dialog>
  );
}
