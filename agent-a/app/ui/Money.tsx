import { cx, formatMoney } from './format';

/** Every amount: "$1,234.56", "₡14,000", "−$52.30"; `signed` adds "+" to positive amounts. */
export function Money({
  cents,
  currency = 'USD',
  signed = false,
  tone,
  className,
}: {
  cents: number;
  currency?: string;
  signed?: boolean;
  tone?: 'positive' | 'negative' | 'secondary';
  className?: string;
}) {
  return (
    <span
      className={cx(
        'tabular',
        tone === 'positive' && 'text-positive',
        tone === 'negative' && 'text-negative',
        tone === 'secondary' && 'text-text-secondary',
        className,
      )}
    >
      {formatMoney(cents, currency, signed)}
    </span>
  );
}
