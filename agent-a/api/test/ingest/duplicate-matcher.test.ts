import { describe, expect, it } from 'vitest';
import { DuplicateMatcher } from '../../src/ingest/duplicate-matcher';
import { USER, txn } from '../helpers';

const parsed = {
  accountId: 'acc-1',
  localDate: '2026-10-14',
  amountMinor: 200000,
  currency: 'CRC' as const,
  direction: 'out' as const,
  statementRef: null,
  source: 'csv' as const,
};

function matcher(existing = [txn({ amountMinor: 200000, currency: 'CRC', sources: ['gmail'], localDate: '2026-10-13' })]) {
  return new DuplicateMatcher({ findNear: async (_u, acc, from, to) => existing.filter((t) => t.accountId === acc && t.localDate >= from && t.localDate <= to) });
}

describe('DuplicateMatcher', () => {
  it('an email and a statement row with the same amount within the window are exact', async () => {
    expect((await matcher().findMatch(USER, parsed)).type).toBe('exact');
  });
  it('the same source never matches itself', async () => {
    expect((await matcher().findMatch(USER, { ...parsed, source: 'gmail' })).type).toBe('none');
  });
  it('a different amount on the same day is a near match', async () => {
    const m = matcher([txn({ amountMinor: 210000, currency: 'CRC', sources: ['gmail'] })]);
    expect((await m.findMatch(USER, parsed)).type).toBe('near');
  });
  it('a different currency, direction, or account is no match', async () => {
    expect((await matcher().findMatch(USER, { ...parsed, currency: 'USD' })).type).toBe('none');
    expect((await matcher().findMatch(USER, { ...parsed, direction: 'in' })).type).toBe('none');
    expect((await matcher().findMatch(USER, { ...parsed, accountId: 'acc-2' })).type).toBe('none');
  });
});
