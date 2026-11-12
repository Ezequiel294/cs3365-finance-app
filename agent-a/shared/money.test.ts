import { describe, expect, it } from 'vitest';
import { addMonths, dateRange, formatMonth, monthRange } from './dates';
import { flowOf } from './kinds';
import { decimalToScaled, divRoundHalfEven, formatBps, formatMoney } from './money';

describe('money', () => {
  it('divRoundHalfEven', () => {
    expect(divRoundHalfEven(5n, 2n)).toBe(2n);
    expect(divRoundHalfEven(7n, 2n)).toBe(4n);
    expect(divRoundHalfEven(-5n, 2n)).toBe(-2n);
    expect(divRoundHalfEven(10n, 3n)).toBe(3n);
  });

  it('decimalToScaled', () => {
    expect(decimalToScaled('510.95', 6)).toBe(510950000n);
    expect(decimalToScaled('154.94', 6)).toBe(154940000n);
    expect(decimalToScaled('0.0000005', 6)).toBe(0n);
    expect(decimalToScaled('0.0000015', 6)).toBe(2n);
    expect(decimalToScaled('1e3', 2)).toBe(100000n);
  });

  it('formatMoney', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(1400000, 'CRC')).toBe('₡14,000');
    expect(formatMoney(-5230)).toBe('−$52.30');
    expect(formatMoney(387, 'USD', true)).toBe('+$3.87');
  });

  it('formatBps', () => {
    expect(formatBps(155)).toBe('1.55%');
    expect(formatBps(130, true)).toBe('+1.3%');
    expect(formatBps(-10)).toBe('−0.1%');
  });
});

describe('dates and kinds', () => {
  it('month helpers', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(formatMonth('2026-10')).toBe('Oct 2026');
    expect(dateRange('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });

  it('flow follows the kind', () => {
    expect(flowOf('sinpe_sent')).toBe('expense');
    expect(flowOf('refund')).toBe('refund');
    expect(flowOf('sinpe_received')).toBe('income');
    expect(flowOf('card_payment')).toBe('excluded');
  });
});
