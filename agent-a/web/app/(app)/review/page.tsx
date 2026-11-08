import { listReview } from "@/actions/review-actions";
import { getReference } from "@/actions/setup-actions";
import { DuplicatePairCard } from "@/components/duplicate-pair";
import { TransactionRow } from "@/components/transaction-row";

/** 02-S06 and 01-S04: everything that needs a decision, with the count, categorized in place. */
export default async function ReviewPage() {
  const [review, ref] = await Promise.all([listReview(), getReference()]);
  if (!review.ok) return <p className="error-text">{review.error}</p>;
  if (!ref.ok) return <p className="error-text">{ref.error}</p>;
  const { uncategorized, duplicates, unparsed, count } = review.data;
  const { categories, tags, accounts } = ref.data;

  return (
    <>
      <h1>Review inbox</h1>
      <p className="muted">{count === 0 ? "Nothing to review. Everything is filed." : `${count} to review.`}</p>

      {duplicates.length > 0 && (
        <>
          <h2>Possible duplicates ({duplicates.length})</h2>
          {duplicates.map((p) => (
            <DuplicatePairCard key={p.transaction.id} pair={p} accounts={accounts} />
          ))}
        </>
      )}

      {uncategorized.length > 0 && (
        <>
          <h2>Uncategorized ({uncategorized.length})</h2>
          <div className="card">
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
                {uncategorized.map((t) => (
                  <TransactionRow key={t.id} txn={t} categories={categories} tags={tags} accounts={accounts} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {unparsed.length > 0 && (
        <>
          <h2>Bank emails that could not be read ({unparsed.length})</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {unparsed.map((m) => (
                  <tr key={m.messageId}>
                    <td className="small">{m.receivedAt.slice(0, 10)}</td>
                    <td className="small">{m.sender}</td>
                    <td>{m.subject}</td>
                    <td className="muted small">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Add these by hand on the Transactions page if they were purchases.</p>
          </div>
        </>
      )}
    </>
  );
}
