'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Catalog } from '@/shared/api-types';
import { KIND_LABELS } from '@/shared/kinds';
import { TRANSACTION_KINDS, type Transaction, type TransactionKind } from '@/shared/types';
import { saveRule } from '../../actions/review-actions';
import { updateTransaction } from '../../actions/transaction-actions';
import { Button } from '../../ui/Button';
import { ChipSelect } from '../../ui/ChipSelect';
import { Dialog } from '../../ui/Dialog';
import { FormField, inputClass } from '../../ui/FormField';
import { useToast } from '../../ui/Toast';

/** Category, tags, and type of one transaction; a category or type change offers a rule (02-S02, 02-S05). */
export function TransactionDialog({ transaction, catalog, onClose }: { transaction: Transaction | null; catalog: Catalog; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [categoryId, setCategoryId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [kind, setKind] = useState<TransactionKind>('purchase');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ saved: Transaction; kindChanged: boolean } | null>(null);

  useEffect(() => {
    if (transaction) {
      setCategoryId(transaction.categoryId ?? '');
      setTagIds(transaction.tagIds);
      setKind(transaction.kind);
      setError(null);
      setOffer(null);
    }
  }, [transaction]);

  if (!transaction) return <Dialog open={false} title="Edit transaction" onClose={onClose}>{null}</Dialog>;

  const catName = (id: string | null) => catalog.categories.find((c) => c.id === id)?.name ?? '';

  const save = async () => {
    setPending(true);
    setError(null);
    const categoryChanged = (categoryId || null) !== transaction.categoryId;
    const kindChanged = kind !== transaction.kind;
    const r = await updateTransaction(transaction.id, { categoryId: categoryId || null, tagIds, kind });
    setPending(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.refresh();
    if ((categoryChanged && categoryId) || kindChanged) {
      setOffer({ saved: r.data, kindChanged });
      return;
    }
    toast.show('Transaction saved');
    onClose();
  };

  const remember = async () => {
    if (!offer) return;
    setPending(true);
    const r = await saveRule(offer.saved.merchantKey, offer.saved.categoryId, offer.saved.tagIds, offer.kindChanged ? offer.saved.kind : null);
    setPending(false);
    toast.show(r.ok ? 'Transaction saved. Later ones from this merchant will be filed the same way.' : r.message, { tone: r.ok ? 'neutral' : 'negative' });
    onClose();
  };

  if (offer) {
    const target = offer.saved.categoryId ? catName(offer.saved.categoryId) : KIND_LABELS[offer.saved.kind];
    return (
      <Dialog
        open
        title="Edit transaction"
        onClose={() => {
          toast.show('Transaction saved');
          onClose();
        }}
        footer={
          <>
            <Button
              onClick={() => {
                toast.show('Transaction saved');
                onClose();
              }}
            >
              Only this one
            </Button>
            <Button variant="primary" pending={pending} onClick={remember}>
              Always
            </Button>
          </>
        }
      >
        <p className="text-sm">{`Always file ${offer.saved.merchantRaw} as ${target}?`}</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title="Edit transaction"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" pending={pending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium">{transaction.merchantRaw}</p>
        <FormField label="Category">
          {({ id }) => (
            <select id={id} className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Tags" as="fieldset">
          {() => (
            <ChipSelect
              options={catalog.tags.map((t) => ({ value: t.id, label: t.name }))}
              selected={tagIds}
              onChange={setTagIds}
              emptyHint="You have no tags yet."
              emptyLink={{ href: '/settings', label: 'Create tags in Settings' }}
            />
          )}
        </FormField>
        <FormField label="Type">
          {({ id }) => (
            <select id={id} className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as TransactionKind)}>
              {TRANSACTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {error ? <p role="alert" className="text-sm text-negative">{error}</p> : null}
      </div>
    </Dialog>
  );
}
