import type { Account, Category, Tag, Transaction } from '@finance/shared';
import Link from 'next/link';
import { TransactionForm } from '@/components/transaction-form';
import { TransactionTable } from '@/components/transaction-table';
import { load } from '@/lib/analytics-loader';
import { addMonths, monthLabel, safe, thisMonth } from '@/lib/page-data';

export const dynamic = 'force-dynamic';

function lastDay(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** TransactionsPage (01-S03, 01-S05, 02-S02, 02-S05, 05-S01). */
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month! : thisMonth();
  const returnTo = `/transactions?month=${month}`;
  const [txns, accounts, categories, tags] = await Promise.all([
    safe(load<Transaction[]>(`/api/transactions?from=${month}-01&to=${lastDay(month)}`, returnTo)),
    safe(load<Account[]>('/api/accounts', returnTo)),
    safe(load<Category[]>('/api/categories', returnTo)),
    safe(load<Tag[]>('/api/tags', returnTo)),
  ]);
  return (
    <>
      <h1>Transactions — {monthLabel(month)}</h1>
      <div className="tabs">
        <Link href={`/transactions?month=${addMonths(month, -1)}`}>← {monthLabel(addMonths(month, -1))}</Link>
        <span>·</span>
        <Link href={`/transactions?month=${addMonths(month, 1)}`}>{monthLabel(addMonths(month, 1))} →</Link>
      </div>
      {(txns.error || accounts.error) && <p className="error">{txns.error ?? accounts.error}</p>}
      <TransactionForm accounts={accounts.data ?? []} categories={categories.data ?? []} tags={tags.data ?? []} />
      <TransactionTable
        transactions={txns.data ?? []}
        accounts={accounts.data ?? []}
        categories={categories.data ?? []}
        tags={tags.data ?? []}
      />
    </>
  );
}
