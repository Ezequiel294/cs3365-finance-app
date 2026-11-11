'use client';

import type { Account, Category, IngestMessage, ReviewList, Tag, Transaction } from '@finance/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dismissDuplicate, mergeDuplicate, retryMessage } from '@/app/actions/review';
import { Amount } from './amount';
import { TransactionEditor } from './transaction-editor';

/** Turns an unparsed email's reason code into words. */
export function reasonText(reason?: string | null): string {
  if (!reason) return 'Not understood';
  const [code, value] = reason.split(':');
  switch (code) {
    case 'UNKNOWN_CARD':
      return `Card ending ${value} isn't linked to an account`;
    case 'UNKNOWN_TYPE':
      return `Transaction type "${value}" is not supported`;
    case 'FIELD_MISSING':
      return `The email has no ${value} the template could read`;
    case 'NO_TEMPLATE':
      return 'No template for this kind of email from the bank';
    default:
      return reason;
  }
}

function DuplicateRow({ pair, accounts }: { pair: ReviewList['duplicates'][number]; accounts: Account[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = (t: Transaction | null) => accounts.find((a) => a.id === t?.accountId)?.name ?? '';
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.error ?? 'Failed');
    router.refresh();
  };
  const describe = (t: Transaction | null, label: string) =>
    t ? (
      <div>
        <strong>{label}</strong> {t.localDate} · <Amount txn={t} /> · {t.merchantRaw} · {name(t)} · {t.sources.join(' + ')}
      </div>
    ) : (
      <div className="muted">{label}: no longer exists</div>
    );
  return (
    <div className="card">
      {describe(pair.existing, 'A')}
      {describe(pair.transaction, 'B')}
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ marginTop: '0.5rem' }}>
        {pair.existing && (
          <button disabled={busy} onClick={() => run(() => mergeDuplicate(pair.existing!.id, pair.transaction.id))}>
            Keep A, merge B into it
          </button>
        )}
        <button disabled={busy} className="secondary" onClick={() => run(() => dismissDuplicate(pair.transaction.id))}>
          Not duplicates, keep both
        </button>
      </div>
    </div>
  );
}

function UnparsedRow({ message }: { message: IngestMessage }) {
  const router = useRouter();
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    const r = await retryMessage(message.messageId);
    setBusy(false);
    if (!r.ok) return setResult(r.error);
    if (r.data.status === 'imported' || r.data.status === 'duplicate') return router.refresh();
    setResult(`${r.data.status}: ${reasonText(r.data.reason)}`);
  }
  return (
    <tr>
      <td>{message.receivedAt.slice(0, 10)}</td>
      <td>{message.subject ?? message.templateId ?? 'Email'}</td>
      <td>{reasonText(message.reason)}</td>
      <td>
        <button className="secondary" disabled={busy} onClick={retry}>
          Retry
        </button>
        {result && <div className="muted">{result}</div>}
      </td>
    </tr>
  );
}

export function ReviewInbox({ review, categories, tags, accounts }: { review: ReviewList; categories: Category[]; tags: Tag[]; accounts: Account[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const pending = review.uncategorized.filter((t) => !done.has(t.id));
  const count = pending.length + review.duplicates.length + review.unparsed.length;
  return (
    <>
      <p>
        <strong>{count}</strong> to review
      </p>
      <h2>To categorize ({pending.length})</h2>
      <div className="card">
        {pending.length === 0 ? (
          <p className="muted">Nothing waiting for a category.</p>
        ) : (
          <table>
            <tbody>
              {pending.map((t) => (
                <tr key={t.id}>
                  <td>{t.localDate}</td>
                  <td>{t.merchantRaw}</td>
                  <td>
                    <Amount txn={t} />
                  </td>
                  <td style={{ minWidth: 280 }}>
                    <TransactionEditor
                      txn={t}
                      categories={categories}
                      tags={tags}
                      onSaved={(next) => next.status === 'confirmed' && setTimeout(() => setDone((d) => new Set(d).add(t.id)), 4000)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <h2>Possible duplicates ({review.duplicates.length})</h2>
      {review.duplicates.length === 0 ? (
        <div className="card muted">No possible duplicates.</div>
      ) : (
        review.duplicates.map((p) => <DuplicateRow key={p.transaction.id} pair={p} accounts={accounts} />)
      )}
      <h2>Emails not understood ({review.unparsed.length})</h2>
      <div className="card">
        {review.unparsed.length === 0 ? (
          <p className="muted">Every bank email was understood.</p>
        ) : (
          <table>
            <tbody>
              {review.unparsed.map((m) => (
                <UnparsedRow key={m.messageId} message={m} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
