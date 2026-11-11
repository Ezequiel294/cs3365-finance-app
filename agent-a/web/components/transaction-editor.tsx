'use client';

import type { Category, Tag, Transaction, TransactionKind } from '@finance/shared';
import { useState } from 'react';
import { saveRule } from '@/app/actions/review';
import { updateTransaction } from '@/app/actions/transactions';
import { KIND_LABELS } from './transaction-form';

/**
 * Category, tags, and kind of one transaction (02-S02). After a change it offers
 * to remember it for the merchant (02-S05).
 */
export function TransactionEditor({
  txn,
  categories,
  tags,
  onSaved,
}: {
  txn: Transaction;
  categories: Category[];
  tags: Tag[];
  onSaved?: (t: Transaction) => void;
}) {
  const [categoryId, setCategoryId] = useState(txn.categoryId ?? '');
  const [tagIds, setTagIds] = useState<string[]>(txn.tagIds ?? []);
  const [kind, setKind] = useState<TransactionKind>(txn.kind);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Transaction | null>(null);
  const [pending, setPending] = useState(false);
  const [version, setVersion] = useState(txn.version);

  async function save(next: { categoryId?: string; tagIds?: string[]; kind?: TransactionKind }) {
    setPending(true);
    setError(null);
    const changes: { categoryId?: string | null; tagIds?: string[]; kind?: TransactionKind; version: number } = { version };
    if (next.categoryId !== undefined) changes.categoryId = next.categoryId || null;
    if (next.tagIds !== undefined) changes.tagIds = next.tagIds;
    if (next.kind !== undefined) changes.kind = next.kind;
    const result = await updateTransaction(txn.id, changes);
    setPending(false);
    if (!result.ok) return setError(result.error);
    setVersion(result.data.version);
    setPrompt(result.data);
    onSaved?.(result.data);
  }

  async function remember() {
    if (!prompt) return;
    const result = await saveRule(prompt.merchantKey, prompt.categoryId, prompt.tagIds, prompt.kind !== txn.kind ? prompt.kind : null);
    if (!result.ok) return setError(result.error);
    setPrompt(null);
  }

  const categoryName = categories.find((c) => c.id === prompt?.categoryId)?.name;

  return (
    <div>
      <div className="row">
        <select aria-label="Category" value={categoryId} disabled={pending} onChange={(e) => (setCategoryId(e.target.value), save({ categoryId: e.target.value }))}>
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Kind" value={kind} disabled={pending} onChange={(e) => (setKind(e.target.value as TransactionKind), save({ kind: e.target.value as TransactionKind }))}>
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {tags.length > 0 && (
        <div style={{ marginTop: '0.3rem' }}>
          {tags.map((t) => (
            <label key={t.id} className="pill" style={{ display: 'inline-flex', gap: '0.2rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={tagIds.includes(t.id)}
                disabled={pending}
                onChange={(e) => {
                  const next = e.target.checked ? [...tagIds, t.id] : tagIds.filter((x) => x !== t.id);
                  setTagIds(next);
                  save({ tagIds: next });
                }}
              />
              {t.name}
            </label>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {prompt && (
        <p className="muted">
          Always file &ldquo;{prompt.merchantRaw}&rdquo; as {categoryName ?? 'this'}
          {prompt.kind !== txn.kind ? ` (${KIND_LABELS[prompt.kind]})` : ''}?{' '}
          <button type="button" className="secondary" onClick={remember}>
            Yes
          </button>{' '}
          <button type="button" className="secondary" onClick={() => setPrompt(null)}>
            Only this one
          </button>
        </p>
      )}
    </div>
  );
}
