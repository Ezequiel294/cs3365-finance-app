import type { Transaction } from '../../shared/types';

export const USER = 'user-0000-1111';

export function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '20261014-abc123def456',
    userId: USER,
    accountId: 'acc-1',
    localDate: '2026-10-14',
    occurredAt: null,
    kind: 'purchase',
    status: 'confirmed',
    currency: 'USD',
    amountMinor: 5000,
    amountUsdCents: 5000,
    fxRate: 1,
    fxDate: '2026-10-14',
    categoryId: 'groceries',
    tagIds: [],
    categorizedBy: 'rule',
    merchantRaw: 'AUTOMERCADO',
    merchantKey: 'automercado',
    sources: ['manual'],
    statementRef: null,
    possibleDuplicateOf: null,
    reviewReason: null,
    version: 1,
    createdAt: '2026-10-14T12:00:00.000Z',
    ...overrides,
  };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
