'use client';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import type { Catalog } from '@/shared/api-types';
import { KIND_LABELS, MONEY_IN_KINDS, MONEY_OUT_KINDS } from '@/shared/kinds';
import type { Account, Currency, TransactionKind } from '@/shared/types';
import { createTransaction } from '../actions/transaction-actions';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { FormField, inputClass } from './FormField';
import { parseAmountInput } from './format';
import { useToast } from './Toast';

const QuickAddContext = createContext<{ open: () => void }>({ open: () => undefined });

export function useQuickAdd() {
  return useContext(QuickAddContext);
}

/** Opens the shell's add-transaction dialog from anywhere (the Transactions page's primary button). */
export function OpenQuickAdd({ variant = 'secondary', label = 'Add transaction' }: { variant?: 'primary' | 'secondary'; label?: string }) {
  const { open } = useQuickAdd();
  return (
    <Button variant={variant} onClick={open}>
      {label}
    </Button>
  );
}

/**
 * "Add transaction" on every page (01-S03, 01-S05). The entry never leaves the page it
 * started from: the dialog closes on success and shows a toast.
 */
export function QuickAddTransaction({ accounts, catalog, today, children }: { accounts: Account[]; catalog: Catalog; today: string; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const ctx = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <QuickAddContext.Provider value={ctx}>
      {children}
      <QuickAddDialog open={isOpen} onClose={() => setOpen(false)} accounts={accounts} catalog={catalog} today={today} />
    </QuickAddContext.Provider>
  );
}

function QuickAddDialog({ open, onClose, accounts, catalog, today }: { open: boolean; onClose: () => void; accounts: Account[]; catalog: Catalog; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const account = accounts.find((a) => a.id === accountId);
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [kind, setKind] = useState<TransactionKind>('purchase');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const effectiveCurrency = (currency || account?.currency || 'USD') as Currency;
  const kinds = direction === 'out' ? MONEY_OUT_KINDS : MONEY_IN_KINDS;

  const switchDirection = (d: 'out' | 'in') => {
    setDirection(d);
    setKind(d === 'out' ? 'purchase' : 'income');
  };

  const reset = () => {
    setAmount('');
    setMerchant('');
    setCategoryId('');
    setFields({});
    setError(null);
    setCurrency('');
    setDate(today);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountMinor = parseAmountInput(amount);
    if (!amountMinor) {
      setFields({ amountMinor: 'Enter an amount, for example 14000 or 27.40' });
      return;
    }
    setPending(true);
    const r = await createTransaction({
      accountId,
      kind,
      amountMinor,
      currency: effectiveCurrency,
      localDate: date,
      merchantRaw: merchant,
      categoryId: categoryId || null,
    });
    setPending(false);
    if (r.ok) {
      toast.show('Transaction saved');
      reset();
      onClose();
      router.refresh();
      return;
    }
    if (r.code === 'FX_UNAVAILABLE') {
      setError(`The exchange rate for ${date} is not available yet. Nothing was saved. Try again in a moment.`);
      return;
    }
    setFields(r.fields ?? {});
    if (!r.fields) setError(r.message);
  };

  if (!accounts.length) {
    return (
      <Dialog open={open} title="Add a transaction" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <p className="text-sm">
          Add an account first, so the transaction has somewhere to go.{' '}
          <a href="/accounts" className="text-accent underline">
            Go to Accounts
          </a>
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      title="Add a transaction"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="quick-add" pending={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="quick-add" onSubmit={submit} className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-2">
          {(['out', 'in'] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={direction === d}
              onClick={() => switchDirection(d)}
              className={`h-11 rounded-[6px] border text-sm sm:h-9 ${direction === d ? 'border-accent bg-accent text-white' : 'border-border bg-surface'}`}
            >
              {d === 'out' ? 'Money out' : 'Money in'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <FormField label="Amount" error={fields.amountMinor}>
            {({ id, describedBy, invalid }) => (
              <input id={id} inputMode="decimal" autoComplete="off" required className={inputClass} placeholder="14000" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
            )}
          </FormField>
          <FormField label="Currency" error={fields.currency}>
            {({ id }) => (
              <select id={id} className={inputClass} value={effectiveCurrency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                <option value="CRC">CRC</option>
                <option value="USD">USD</option>
              </select>
            )}
          </FormField>
        </div>
        <FormField label="Account" error={fields.accountId}>
          {({ id }) => (
            <select id={id} className={inputClass} value={accountId} onChange={(e) => { setAccountId(e.target.value); setCurrency(''); }}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Date" error={fields.localDate}>
          {({ id, describedBy, invalid }) => (
            <input id={id} type="date" required max={today} className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
          )}
        </FormField>
        <FormField label="Merchant or description" error={fields.merchantRaw}>
          {({ id, describedBy, invalid }) => (
            <input id={id} required maxLength={120} className={inputClass} placeholder="Feria del agricultor" value={merchant} onChange={(e) => setMerchant(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} />
          )}
        </FormField>
        <FormField label="Category" error={fields.categoryId}>
          {({ id }) => (
            <select id={id} className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Choose automatically</option>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <details>
          <summary className="text-sm text-accent">More options</summary>
          <div className="mt-3">
            <FormField label="Type" error={fields.kind}>
              {({ id }) => (
                <select id={id} className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as TransactionKind)}>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
        </details>
        {error ? (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
