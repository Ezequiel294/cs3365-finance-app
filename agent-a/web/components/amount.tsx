import { formatMinor, formatUsd, type Transaction } from '@finance/shared';

function rateDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Original amount first, then USD and the rate behind it (05-S01, 05-S02). */
export function Amount({ txn }: { txn: Pick<Transaction, 'amountMinor' | 'currency' | 'amountUsdCents' | 'fxRate' | 'fxDate'> }) {
  const original = formatMinor(txn.amountMinor, txn.currency);
  if (txn.currency === 'USD') return <span>{original}</span>;
  return (
    <span>
      {original}{' '}
      <span className="muted">
        ({formatUsd(txn.amountUsdCents)} at {txn.fxRate} on {rateDate(txn.fxDate)})
      </span>
    </span>
  );
}
