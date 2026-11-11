'use client';

import { parseAmountInput, type Account, type Category, type Tag, type TransactionKind } from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createTransaction } from '@/app/actions/transactions';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());

export const KIND_LABELS: Record<TransactionKind, string> = {
  purchase: 'Purchase',
  refund: 'Refund',
  income: 'Income',
  sinpe_sent: 'SINPE sent',
  sinpe_received: 'SINPE received',
  payment_sent: 'Payment sent',
  transfer: 'Transfer (own accounts)',
  card_payment: 'Card payment',
};

/** Manual entry in a few seconds (01-S03); "Money in" records income (01-S05). */
export function TransactionForm({ accounts, categories, tags }: { accounts: Account[]; categories: Category[]; tags: Tag[] }) {
  const router = useRouter();
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const account = accounts.find((a) => a.id === accountId);
  const [currency, setCurrency] = useState<'USD' | 'CRC' | ''>('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  if (accounts.length === 0) {
    return (
      <div className="card">
        <p className="muted">
          Add an account first on the <a href="/accounts">Accounts</a> page.
        </p>
      </div>
    );
  }

  async function submit(form: FormData) {
    const amountMinor = parseAmountInput(String(form.get('amount') ?? ''));
    if (!amountMinor) return setMessage({ ok: false, text: 'Enter an amount greater than zero.' });
    setPending(true);
    const tagIds = form.getAll('tagIds').map(String);
    const result = await createTransaction({
      accountId,
      kind: String(form.get('kind')) as TransactionKind,
      localDate: String(form.get('localDate')),
      currency: (currency || account?.currency || 'USD') as 'USD' | 'CRC',
      amountMinor,
      merchantRaw: String(form.get('merchantRaw')),
      categoryId: String(form.get('categoryId') ?? '') || null,
      tagIds,
      note: null,
    });
    setPending(false);
    if (!result.ok) return setMessage({ ok: false, text: result.error });
    setMessage({ ok: true, text: 'Saved.' });
    router.refresh();
  }

  return (
    <form action={submit} className="card">
      <div className="tabs">
        <button type="button" className={direction === 'out' ? 'active' : ''} onClick={() => setDirection('out')}>
          Money out
        </button>
        <button type="button" className={direction === 'in' ? 'active' : ''} onClick={() => setDirection('in')}>
          Money in
        </button>
      </div>
      {message && <p className={message.ok ? 'ok' : 'error'}>{message.text}</p>}
      <div className="row">
        <div>
          <label htmlFor="amount">Amount</label>
          <input id="amount" name="amount" inputMode="decimal" placeholder="0.00" required autoFocus />
        </div>
        <div>
          <label htmlFor="currency">Currency</label>
          <select id="currency" value={currency || account?.currency} onChange={(e) => setCurrency(e.target.value as 'USD' | 'CRC')}>
            <option value="CRC">CRC</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label htmlFor="accountId">Account</label>
          <select id="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="localDate">{direction === 'in' ? 'Date received' : 'Date'}</label>
          <input id="localDate" name="localDate" type="date" defaultValue={today()} required />
        </div>
      </div>
      <div className="row">
        <div>
          <label htmlFor="merchantRaw">{direction === 'in' ? 'From' : 'Merchant or description'}</label>
          <input id="merchantRaw" name="merchantRaw" required placeholder={direction === 'in' ? 'Client name' : 'Feria del agricultor'} />
        </div>
        <div>
          <label htmlFor="kind">Kind</label>
          <select id="kind" name="kind" key={direction} defaultValue={direction === 'in' ? 'income' : 'purchase'}>
            {(direction === 'in'
              ? (['income', 'sinpe_received', 'refund', 'transfer'] as const)
              : (['purchase', 'sinpe_sent', 'payment_sent', 'transfer', 'card_payment'] as const)
            ).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="categoryId">Category (optional)</label>
          <select id="categoryId" name="categoryId" defaultValue="">
            <option value="">Automatic</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {tags.length > 0 && (
          <div>
            <label htmlFor="tagIds">Tags</label>
            <select id="tagIds" name="tagIds" multiple size={Math.min(4, tags.length)}>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <button type="submit" disabled={pending} style={{ marginTop: '0.8rem' }}>
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
