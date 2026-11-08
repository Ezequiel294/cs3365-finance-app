import Link from "next/link";
import { listTransactions } from "@/actions/transaction-actions";
import { getReference } from "@/actions/setup-actions";
import { TransactionForm } from "@/components/transaction-form";
import { TransactionRow } from "@/components/transaction-row";
import { addMonths, monthName, todayIn } from "@/lib/format";

function lastDay(month: string): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  return d.toISOString().slice(0, 10);
}

/** 01-S03, 01-S05, 02-S02, 05-S01: add entries and see each amount in its original currency. */
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const today = todayIn();
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : today.slice(0, 7);
  const [ref, txns] = await Promise.all([getReference(), listTransactions(`${month}-01`, lastDay(month))]);
  if (!ref.ok) return <p className="error-text">{ref.error}</p>;
  const { accounts, categories, tags } = ref.data;

  return (
    <>
      <h1>Transactions</h1>
      <TransactionForm accounts={accounts} categories={categories} tags={tags} today={today} />
      <div className="row between">
        <h2>{monthName(month)}</h2>
        <div className="row">
          <Link href={`/transactions?month=${addMonths(month, -1)}`}>← Previous</Link>
          <Link href={`/transactions?month=${addMonths(month, 1)}`}>Next →</Link>
        </div>
      </div>
      <div className="card">
        {!txns.ok ? (
          <p className="error-text">{txns.error}</p>
        ) : txns.data.length === 0 ? (
          <p className="muted">No transactions in {monthName(month)}.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th>Category and tags</th>
              </tr>
            </thead>
            <tbody>
              {txns.data.map((t) => (
                <TransactionRow key={t.id} txn={t} categories={categories} tags={tags} accounts={accounts} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
