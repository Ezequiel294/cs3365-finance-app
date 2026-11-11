'use client';

import type { Account, Category, Tag, Transaction } from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createCategory, createTag } from '@/app/actions/transactions';
import { Amount } from './amount';
import { TransactionEditor } from './transaction-editor';

/** The month's transactions with their original currency and the rate used. */
export function TransactionTable({
  transactions,
  accounts,
  categories,
  tags,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
}) {
  const router = useRouter();
  const [newTag, setNewTag] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—';

  async function add(kind: 'tag' | 'category') {
    const name = kind === 'tag' ? newTag : newCategory;
    if (!name.trim()) return;
    const result = kind === 'tag' ? await createTag(name.trim()) : await createCategory(name.trim());
    if (!result.ok) return setError(result.error);
    setNewTag('');
    setNewCategory('');
    router.refresh();
  }

  return (
    <div className="card">
      <div className="row">
        <div>
          <label htmlFor="newTag">New tag</label>
          <input id="newTag" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="University" />
        </div>
        <button type="button" className="secondary" onClick={() => add('tag')} style={{ flex: '0 0 auto' }}>
          Add tag
        </button>
        <div>
          <label htmlFor="newCategory">New category</label>
          <input id="newCategory" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Pets" />
        </div>
        <button type="button" className="secondary" onClick={() => add('category')} style={{ flex: '0 0 auto' }}>
          Add category
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {transactions.length === 0 ? (
        <p className="muted">No transactions this month.</p>
      ) : (
        <table style={{ marginTop: '0.8rem' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Category, kind, tags</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id}>
                <td>{t.localDate}</td>
                <td>
                  {t.merchantRaw}
                  <div className="muted">
                    {accountName(t.accountId)} · {t.sources.join(' + ')}
                    {t.status === 'pending_review' ? ' · to review' : ''}
                    {t.possibleDuplicateOf ? ' · possible duplicate' : ''}
                  </div>
                </td>
                <td>
                  <Amount txn={t} />
                </td>
                <td style={{ minWidth: 280 }}>
                  <TransactionEditor txn={t} categories={categories} tags={tags} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
