import { cx, formatBps, formatMoney } from './format';

/**
 * A gain, loss, or difference: always a sign, an arrow, and the amount (and percent):
 * "▲ +$3.87 (+1.3%)". Tone follows whether the direction is good, never colour alone.
 */
export function Delta({ amountCents, bps, upIsGood = true, className }: { amountCents: number; bps?: number | null; upIsGood?: boolean; className?: string }) {
  const up = amountCents > 0;
  const flat = amountCents === 0;
  const good = flat ? null : up === upIsGood;
  const arrow = flat ? '' : up ? '▲ ' : '▼ ';
  return (
    <span className={cx('tabular whitespace-nowrap', good === true && 'text-positive', good === false && 'text-negative', className)}>
      {arrow}
      {formatMoney(amountCents, 'USD', true)}
      {bps !== undefined && bps !== null ? ` (${formatBps(Math.round(bps / 10) * 10, true)})` : ''}
    </span>
  );
}
