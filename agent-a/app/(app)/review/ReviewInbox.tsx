'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Catalog, DuplicatePair, ReviewList } from '@/shared/api-types';
import type { Account, IngestMessage, Transaction } from '@/shared/types';
import { dismissDuplicate, mergeDuplicate, retryMessage, saveRule } from '../../actions/review-actions';
import { updateTransaction } from '../../actions/transaction-actions';
import { Button } from '../../ui/Button';
import { SectionEmpty } from '../../ui/EmptyState';
import { formatDateTime, formatDay } from '../../ui/format';
import { inputClass } from '../../ui/FormField';
import { Section } from '../../ui/Section';
import { useToast } from '../../ui/Toast';
import { AmountCell } from '../transactions/TransactionTable';

export type ReviewTab = 'categorize' | 'duplicates' | 'emails';

/** The reason an email was not understood, in words, with what to do about it. */
export function reasonInWords(reason: string | null): string {
  const [code, detail] = (reason ?? '').split(':');
  switch (code) {
    case 'UNKNOWN_CARD':
      return `Card ending ${detail} isn't linked to an account. Add the card to an account, then try again.`;
    case 'NO_TEMPLATE':
      return 'This email from your bank is not a card alert the app can read.';
    case 'UNKNOWN_TYPE':
      return `The email is about a "${detail}", which the app does not record yet. Add it by hand if you need it.`;
    case 'FIELD_MISSING':
      return `Part of the email (${detail}) could not be read. The bank may have changed its format.`;
    default:
      return 'The email could not be read.';
  }
}

const SOURCE_LABEL: Record<string, string> = { gmail: 'Bank email', csv: 'Statement', manual: 'Added by hand' };

export function ReviewInbox({
  tab,
  list,
  catalog,
  accounts,
  timeZone,
  currentYear,
}: {
  tab: ReviewTab;
  list: ReviewList;
  catalog: Catalog;
  accounts: Account[];
  timeZone: string;
  currentYear: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [uncategorized, setUncategorized] = useState(list.uncategorized);
  const [duplicates, setDuplicates] = useState(list.duplicates);
  const [unparsed, setUnparsed] = useState(list.unparsed);
  const [busy, setBusy] = useState<string | null>(null);
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—';

  /** Choosing a category files the row at once (02-S06). */
  const file = async (t: Transaction, categoryId: string) => {
    if (!categoryId) return;
    setBusy(t.id);
    const r = await updateTransaction(t.id, { categoryId });
    setBusy(null);
    if (!r.ok) {
      toast.show(r.message, { tone: 'negative' });
      return;
    }
    setUncategorized((u) => u.filter((x) => x.id !== t.id));
    router.refresh();
    const name = catalog.categories.find((c) => c.id === categoryId)?.name ?? '';
    toast.show(`Filed under ${name}.`, {
      action: {
        label: `Always file ${t.merchantRaw} this way`,
        onClick: async () => {
          const rr = await saveRule(r.data.merchantKey, categoryId, r.data.tagIds, null);
          toast.show(rr.ok ? `${t.merchantRaw} will be filed under ${name} from now on.` : rr.message, { tone: rr.ok ? 'neutral' : 'negative' });
        },
      },
    });
  };

  const merge = async (pair: DuplicatePair) => {
    if (!pair.existing) return;
    setBusy(pair.flagged.id);
    const r = await mergeDuplicate(pair.existing.id, pair.flagged.id);
    setBusy(null);
    if (!r.ok) return toast.show(r.message, { tone: 'negative' });
    setDuplicates((d) => d.filter((x) => x.flagged.id !== pair.flagged.id));
    toast.show('Merged into one transaction.');
    router.refresh();
  };

  const keepBoth = async (pair: DuplicatePair) => {
    setBusy(pair.flagged.id);
    const r = await dismissDuplicate(pair.flagged.id);
    setBusy(null);
    if (!r.ok) return toast.show(r.message, { tone: 'negative' });
    setDuplicates((d) => d.filter((x) => x.flagged.id !== pair.flagged.id));
    toast.show('Kept both transactions.');
    router.refresh();
  };

  const retry = async (m: IngestMessage) => {
    setBusy(m.messageId);
    const r = await retryMessage(m.messageId);
    setBusy(null);
    if (!r.ok) return toast.show(r.message, { tone: 'negative' });
    if (r.data.status === 'unparsed') {
      setUnparsed((u) => u.map((x) => (x.messageId === m.messageId ? { ...x, reason: r.data.reason ?? x.reason } : x)));
      toast.show('The email still could not be read.', { tone: 'negative' });
    } else {
      setUnparsed((u) => u.filter((x) => x.messageId !== m.messageId));
      toast.show(r.data.status === 'imported' ? 'The email was read and its transaction saved.' : 'The email was not accepted.');
    }
    router.refresh();
  };

  if (tab === 'categorize') {
    return (
      <Section>
        {uncategorized.length === 0 ? (
          <SectionEmpty title="Everything is filed" body="New transactions that no rule settles will wait here." />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {uncategorized.map((t) => (
              <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[minmax(0,2fr)_auto_auto_minmax(12rem,1fr)]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{t.merchantRaw}</div>
                  <div className="text-[13px] text-text-secondary">
                    {formatDay(t.localDate, currentYear)} · {accountName(t.accountId)}
                  </div>
                </div>
                <div className="sm:col-start-3">
                  <AmountCell t={t} />
                </div>
                <label className="col-span-2 sm:col-span-1 sm:col-start-4">
                  <span className="sr-only">Category for {t.merchantRaw}</span>
                  <select className={inputClass} defaultValue="" disabled={busy === t.id} onChange={(e) => file(t, e.target.value)}>
                    <option value="" disabled>
                      Choose a category
                    </option>
                    {catalog.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Section>
    );
  }

  if (tab === 'duplicates') {
    return (
      <div className="flex flex-col gap-6">
        {duplicates.length === 0 ? (
          <Section>
            <SectionEmpty title="No possible duplicates" body="When the same charge seems to arrive twice, both appear here side by side." />
          </Section>
        ) : (
          duplicates.map((pair) => (
            <Section key={pair.flagged.id}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[pair.existing, pair.flagged].map((t, i) =>
                  t ? (
                    <div key={t.id} className="rounded-[6px] border border-border p-3">
                      <div className="text-[13px] text-text-secondary">{i === 0 ? 'Recorded first' : 'Arrived later'} · {t.sources.map((s) => SOURCE_LABEL[s] ?? s).join(' + ')}</div>
                      <div className="mt-1 text-sm font-medium">{t.merchantRaw}</div>
                      <div className="text-[13px] text-text-secondary">
                        {formatDay(t.localDate, currentYear)} · {accountName(t.accountId)}
                      </div>
                      <div className="mt-2">
                        <AmountCell t={t} />
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="rounded-[6px] border border-border p-3 text-sm text-text-secondary">
                      The other transaction no longer exists.
                    </div>
                  ),
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button pending={busy === pair.flagged.id} onClick={() => keepBoth(pair)}>
                  Different purchases, keep both
                </Button>
                <Button variant="primary" disabled={!pair.existing || busy === pair.flagged.id} onClick={() => merge(pair)}>
                  Same purchase, merge them
                </Button>
              </div>
            </Section>
          ))
        )}
      </div>
    );
  }

  return (
    <Section>
      {unparsed.length === 0 ? (
        <SectionEmpty title="Every email was read" body="Bank emails the app could not read will appear here." />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {unparsed.map((m) => (
            <li key={m.messageId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[13px] text-text-secondary">Received {formatDateTime(m.receivedAt, timeZone)}</div>
                <div className="text-sm">{reasonInWords(m.reason)}</div>
                {m.reason?.startsWith('UNKNOWN_CARD') ? (
                  <Link href="/accounts" className="text-sm text-accent underline">
                    Go to Accounts
                  </Link>
                ) : null}
              </div>
              <Button pending={busy === m.messageId} onClick={() => retry(m)}>
                Try again
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
