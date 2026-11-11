import { describe, expect, it } from 'vitest';
import { countsAsSpending, flowOf } from '../src/flow';
import { formatMinor, parseAmountInput, parseQuantityInput } from '../src/format';
import { divRoundHalfEven, marketValueCents, parseDecimal } from '../src/money';
import { NewAccount, NewBroker, NewInvestmentTransaction, NewTransaction, TickerSchema } from '../src/schemas';

describe('money', () => {
  it('rounds half to even', () => {
    expect(divRoundHalfEven(5n, 2n)).toBe(2n);
    expect(divRoundHalfEven(7n, 2n)).toBe(4n);
    expect(divRoundHalfEven(-5n, 2n)).toBe(-2n);
    expect(divRoundHalfEven(10n, 3n)).toBe(3n);
  });

  it('parses decimals exactly', () => {
    expect(parseDecimal('510.95', 2)).toBe(51095n);
    expect(parseDecimal('154.94', 6)).toBe(154940000n);
    expect(parseDecimal('0.0000005', 6)).toBe(0n);
    expect(parseDecimal('0.0000015', 6)).toBe(2n);
  });

  it('values holdings with BigInt beyond 2^53', () => {
    // 0.6533 VT at $154.94 = $101.22
    expect(marketValueCents(653300, 154940000)).toBe(10122);
    // half a bitcoin at $97,123.45: the product exceeds 2^53
    expect(marketValueCents(500000, 97123450000)).toBe(4856172);
  });
});

describe('flow', () => {
  it('maps kinds to flows', () => {
    expect(flowOf('sinpe_sent')).toBe('expense');
    expect(flowOf('refund')).toBe('refund');
    expect(flowOf('sinpe_received')).toBe('income');
    expect(flowOf('transfer')).toBe('excluded');
    expect(countsAsSpending('refund')).toBe(true);
    expect(countsAsSpending('income')).toBe(false);
    expect(countsAsSpending('card_payment')).toBe(false);
  });
});

describe('format', () => {
  it('formats and parses amounts', () => {
    expect(formatMinor(1400000, 'CRC')).toBe('₡14,000.00');
    expect(formatMinor(2740, 'USD')).toBe('$27.40');
    expect(parseAmountInput('1,234.5')).toBe(123450);
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseQuantityInput('0.6533')).toBe(653300);
  });
});

describe('schemas', () => {
  it('normalizes and validates an IBAN and cards', () => {
    const ok = NewAccount.parse({ name: 'BAC colones', bank: 'BAC', currency: 'CRC', iban: 'cr00 0102 0000 0123 4567 81', cardLast4s: ['1111'] });
    expect(ok.iban).toBe('CR00010200000123456781');
    expect(NewAccount.safeParse({ name: 'x', bank: 'BAC', currency: 'CRC', iban: 'CR123' }).success).toBe(false);
    expect(NewAccount.safeParse({ name: 'x', bank: 'BAC', currency: 'CRC', cardLast4s: ['123'] }).success).toBe(false);
    expect(NewAccount.safeParse({ name: 'x', bank: 'HSBC', currency: 'CRC' }).success).toBe(false);
  });

  it('validates transactions', () => {
    const base = { accountId: 'a1', kind: 'purchase', localDate: '2026-10-14', currency: 'CRC', amountMinor: 1400000, merchantRaw: 'Cash' };
    expect(NewTransaction.safeParse(base).success).toBe(true);
    expect(NewTransaction.safeParse({ ...base, localDate: '2026-02-30' }).success).toBe(false);
    expect(NewTransaction.safeParse({ ...base, amountMinor: -1 }).success).toBe(false);
    expect(NewTransaction.safeParse({ ...base, amountMinor: 1.5 }).success).toBe(false);
  });

  it('validates investment transactions per type', () => {
    expect(
      NewInvestmentTransaction.safeParse({ type: 'DEPOSIT', brokerId: 'b', localDate: '2026-10-01', amountCents: 30000 }).success,
    ).toBe(true);
    expect(NewInvestmentTransaction.safeParse({ type: 'BUY', brokerId: 'b', localDate: '2026-10-01', amountCents: 1 }).success).toBe(false);
    const buy = NewInvestmentTransaction.parse({
      type: 'BUY', brokerId: 'b', localDate: '2026-10-01', ticker: 'btc/usd', assetClass: 'CRYPTO', quantityMicro: 2712, grossCents: 20000,
    });
    expect(buy.type === 'BUY' && buy.ticker).toBe('BTC-USD');
    expect(TickerSchema.parse('vwra.l')).toBe('VWRA.L');
  });

  it('bounds fee schedules', () => {
    const fee = { flatCents: 0, percentBps: 155 };
    const fees = { deposit: fee, withdrawal: fee, buy: { security: fee, crypto: fee }, sell: { security: fee, crypto: fee } };
    expect(NewBroker.safeParse({ name: 'Hapi', fees }).success).toBe(true);
    expect(NewBroker.safeParse({ name: 'Hapi', fees: { ...fees, deposit: { flatCents: 0, percentBps: 10000 } } }).success).toBe(false);
    expect(NewBroker.safeParse({ name: 'Hapi', fees: { ...fees, deposit: { flatCents: -1, percentBps: 0 } } }).success).toBe(false);
  });
});
