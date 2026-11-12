'use client';
import { useState } from 'react';
import type { Catalog } from '@/shared/api-types';
import { flowOf, KIND_LABELS } from '@/shared/kinds';
import type { Account, Transaction } from '@/shared/types';
import { Badge } from '../../ui/Badge';
import { formatMoney, formatWeekdayDay } from '../../ui/format';
import { TransactionDialog } from './TransactionDialog';

/** The original amount first; the USD amount and the rate under it (05-S01, 05-S02). */
export function AmountCell({ t }: { t: Transaction }) {
  const flow = flowOf(t.kind);
  const excluded = flow === 'excluded';
  const moneyIn = flow === 'income' || flow === 'refund';
  return (
    <div className={`text-right tabular ${excluded ? 'text-text-secondary' : ''}`}>
      <div className={moneyIn && !excluded ? 'text-positive' : ''}>{formatMoney(t.amountMinor, t.currency, moneyIn && !excluded)}</div>
      {t.currency !== 'USD' ? (
        <div className="text-[13px] text-text-secondary">
          {formatMoney(t.amountUsdCents)} at {t.fxRate}
        </div>
      ) : null}
    </div>
  );
}

/** Grouped by day, newest first; a row opens TransactionDialog. */
export function TransactionTable({ transactions, catalog, accounts, currentYear }: { transactions: Transaction[]; catalog: Catalog; accounts: Account[]; currentYear: number }) {
  const [selected, setSelected] = useState<Transaction | null>(null);
  const catName = (id: string | null) => (id ? (catalog.categories.find((c) => c.id === id)?.name ?? 'Removed category') : null);
  const tagName = (id: string) => catalog.tags.find((t) => t.id === id)?.name ?? 'Removed tag';
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? '—';

  const days = new Map<string, Transaction[]>();
  for (const t of transactions) days.set(t.localDate, [...(days.get(t.localDate) ?? []), t]);

  return (
    <>
      <div className="flex flex-col gap-6">
        {[...days.entries()].map(([day, rows]) => (
          <div key={day}>
            <h3 className="mb-2 text-[13px] font-semibold text-text-secondary">{formatWeekdayDay(day, currentYear)}</h3>
            <ul className="flex flex-col divide-y divide-border rounded-[6px] border border-border">
              {rows.map((t) => {
                const excluded = flowOf(t.kind) === 'excluded';
                const cat = catName(t.categoryId);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(t)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-3 py-3 text-left hover:bg-page sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-center"
                      aria-label={`Edit ${t.merchantRaw}`}
                    >
                      <span className={`truncate text-sm ${excluded ? 'text-text-secondary' : 'font-medium'}`}>{t.merchantRaw}</span>
                      <span className="col-span-2 row-start-2 flex flex-wrap gap-1 sm:col-span-1 sm:row-start-1 sm:col-start-2">
                        {excluded ? (
                          <Badge label="Not counted" />
                        ) : cat ? (
                          <Badge label={cat} />
                        ) : (
                          <Badge label="Needs a category" tone="warning" />
                        )}
                        {t.tagIds.map((id) => (
                          <Badge key={id} label={`# ${tagName(id)}`} tone="accent" />
                        ))}
                        {t.possibleDuplicateOf ? <Badge label="Possible duplicate" tone="warning" /> : null}
                        {excluded ? <span className="text-[13px] text-text-secondary">{KIND_LABELS[t.kind]}</span> : null}
                      </span>
                      <span className="hidden truncate text-sm text-text-secondary sm:block">{accountName(t.accountId)}</span>
                      <span className="row-start-1 col-start-2 sm:col-start-4">
                        <AmountCell t={t} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <TransactionDialog transaction={selected} catalog={catalog} onClose={() => setSelected(null)} />
    </>
  );
}
