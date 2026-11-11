'use client';

import type { Account } from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createAccount, updateAccount } from '@/app/actions/accounts';

const BANK_NAMES = { BAC: 'BAC Credomatic', BN: 'Banco Nacional' } as const;

function cardsFrom(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

function AccountForm({ account, onDone }: { account?: Account; onDone: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    const common = {
      name: String(form.get('name')),
      iban: String(form.get('iban') ?? '').trim() || null,
      cardLast4s: cardsFrom(String(form.get('cards') ?? '')),
    };
    const result = account
      ? await updateAccount(account.id, { ...common, version: account.version })
      : await createAccount({
          ...common,
          type: 'bank',
          bank: String(form.get('bank')) as Account['bank'],
          currency: String(form.get('currency')) as Account['currency'],
        });
    setPending(false);
    if (!result.ok) return setError(result.error);
    onDone();
    router.refresh();
  }

  return (
    <form action={submit} className="card">
      <h2>{account ? `Edit ${account.name}` : 'New account'}</h2>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" defaultValue={account?.name} placeholder="BAC colones" required />
        </div>
        <div>
          <label htmlFor="bank">Bank</label>
          <select id="bank" name="bank" defaultValue={account?.bank ?? 'BAC'} disabled={!!account}>
            <option value="BAC">BAC Credomatic</option>
            <option value="BN">Banco Nacional</option>
          </select>
        </div>
        <div>
          <label htmlFor="currency">Currency</label>
          <select id="currency" name="currency" defaultValue={account?.currency ?? 'CRC'} disabled={!!account}>
            <option value="CRC">CRC (colones)</option>
            <option value="USD">USD (dollars)</option>
          </select>
        </div>
      </div>
      <div className="row">
        <div>
          <label htmlFor="iban">IBAN (optional, CR + 20 digits)</label>
          <input id="iban" name="iban" defaultValue={account?.iban ?? ''} placeholder="CR00 0102 0000 0123 4567 81" />
        </div>
        <div>
          <label htmlFor="cards">Last 4 digits of each linked card (comma separated)</label>
          <input id="cards" name="cards" defaultValue={account?.cardLast4s.join(', ')} placeholder="1111, 2222" />
        </div>
      </div>
      <p className="muted">The IBAN lets transfers to this account be recognized as your own. Cards route alert emails to this account.</p>
      <div className="row">
        <button type="submit" disabled={pending}>
          {account ? 'Save' : 'Add account'}
        </button>
        {account && (
          <button type="button" className="secondary" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function AccountsManager({ accounts }: { accounts: Account[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const current = accounts.find((a) => a.id === editing);
  return (
    <>
      <div className="card">
        {accounts.length === 0 ? (
          <p className="muted">No accounts yet. Add one to import statements or receive card alerts.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Bank</th>
                <th>Currency</th>
                <th>IBAN</th>
                <th>Cards</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{BANK_NAMES[a.bank]}</td>
                  <td>{a.currency}</td>
                  <td>
                    <code>{a.iban ?? '—'}</code>
                  </td>
                  <td>{a.cardLast4s.length ? a.cardLast4s.map((c) => `•••• ${c}`).join(', ') : '—'}</td>
                  <td>
                    <button className="secondary" type="button" onClick={() => setEditing(a.id)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {current ? <AccountForm key={current.id} account={current} onDone={() => setEditing(null)} /> : <AccountForm onDone={() => undefined} />}
    </>
  );
}
