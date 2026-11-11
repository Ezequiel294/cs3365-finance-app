import { BatchGetCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Transaction } from '@finance/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/clock';
import { AlreadyClaimedError, FxUnavailableError, ValidationError } from '../../src/errors';
import { AggregateRepository } from '../../src/repositories/aggregate-repository';
import { ReferenceRepository } from '../../src/repositories/reference-repository';
import { TransactionRepository } from '../../src/repositories/transaction-repository';
import { BudgetMatcher } from '../../src/services/budget-matcher';
import { Categorizer } from '../../src/services/categorizer';
import { FxService } from '../../src/services/fx-service';
import { Normalizer } from '../../src/services/normalizer';
import { RollupPlanner } from '../../src/services/rollup-planner';
import { TransactionService } from '../../src/services/transaction-service';
import { cancelled, mockedStore } from '../ddb-mock';

const clock = new FixedClock(new Date('2026-10-20T15:00:00Z'));
const account = { id: 'acc-crc', name: 'BAC colones', bank: 'BAC', currency: 'CRC', cardLast4s: [], version: 1 };
const budget = { id: 'b1', name: 'Groceries', categoryIds: ['groceries'], tagIds: [], period: 'MONTHLY', limitCents: 30000, version: 1 };

function build(rateAvailable = true) {
  const { store, mock } = mockedStore();
  const txRepo = new TransactionRepository(store, 'Tx');
  const agg = new AggregateRepository(store, 'Agg');
  const ref = new ReferenceRepository(store, 'Ref');
  const fx = new FxService({ rateFor: async (d) => (rateAvailable ? { date: d, rate: 510.95, rateDate: d, source: 'BCCR' } : null) }, agg, clock);
  const service = new TransactionService(txRepo, agg, ref, store, fx, new Normalizer(), new Categorizer(ref), new BudgetMatcher(), new RollupPlanner(), clock);
  mock.on(GetCommand).callsFake((input) => {
    if (input.Key.SK === 'ACCOUNT#acc-crc') return { Item: { PK: 'USER#u', ...input.Key, ...account } };
    return {};
  });
  mock.on(PutCommand).resolves({});
  mock.on(QueryCommand).callsFake((input) => ({ Items: input.ExpressionAttributeValues[':p'] === 'BUDGET#' ? [{ PK: 'USER#u', SK: 'BUDGET#b1', ...budget }] : [] }));
  mock.on(BatchGetCommand).callsFake((input) => {
    const keys = input.RequestItems.Ref.Keys as { PK: string; SK: string }[];
    return { Responses: { Ref: keys.filter((k) => k.PK === 'GLOBAL' && ['CAT#groceries', 'CAT#eating-out'].includes(k.SK)).map((k) => ({ ...k, id: k.SK.slice(4), name: k.SK, archived: false })) } };
  });
  mock.on(TransactWriteCommand).resolves({});
  return { service, mock };
}

const writes = (mock: ReturnType<typeof mockedStore>['mock']) => mock.commandCalls(TransactWriteCommand).map((c) => c.args[0].input.TransactItems!);

describe('TransactionService', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('creates a CRC transaction with its USD conversion and every rollup in one TransactWriteItems', async () => {
    const txn = await ctx.service.create('u', {
      accountId: 'acc-crc', kind: 'purchase', localDate: '2026-10-14', currency: 'CRC', amountMinor: 1400000, merchantRaw: 'Feria', tagIds: [], categoryId: 'groceries',
    });
    expect(txn).toMatchObject({ amountMinor: 1400000, currency: 'CRC', amountUsdCents: 2740, fxRate: 510.95, fxDate: '2026-10-14', status: 'confirmed', categorizedBy: 'user' });
    const [items] = writes(ctx.mock);
    expect(items[0].Put?.Item).toMatchObject({ PK: 'USER#u', SK: `TXN#2026-10-14#${txn.id}` });
    const updated = items.slice(1).map((i) => i.Update!.Key!.SK);
    expect(updated.sort()).toEqual(['BUDGET#b1#D#2026-10-14', 'BUDGET#b1#P#2026-10-01', 'DAY#2026-10-14#TOTAL', 'MONTH#2026-10#CAT#groceries', 'MONTH#2026-10#TOTAL']);
  });

  it('puts an uncategorized manual entry in the review inbox', async () => {
    const txn = await ctx.service.create('u', {
      accountId: 'acc-crc', kind: 'purchase', localDate: '2026-10-14', currency: 'USD', amountMinor: 1200, merchantRaw: 'Kiosk', tagIds: [],
    });
    expect(txn.status).toBe('pending_review');
    const [items] = writes(ctx.mock);
    expect(items[0].Put?.Item).toMatchObject({ reviewPK: 'USER#u', reviewSK: `UNCATEGORIZED#2026-10-14#${txn.id}` });
  });

  it('records income without touching budgets (01-S05)', async () => {
    await ctx.service.create('u', {
      accountId: 'acc-crc', kind: 'income', localDate: '2026-10-14', currency: 'USD', amountMinor: 50000, merchantRaw: 'Client', tagIds: [], categoryId: 'groceries',
    });
    const [items] = writes(ctx.mock);
    const keys = items.slice(1).map((i) => i.Update!.Key!.SK);
    expect(keys.some((k) => String(k).startsWith('BUDGET#'))).toBe(false);
    expect(items[1].Update!.ExpressionAttributeValues).toMatchObject({ ':a0': 0, ':a1': 50000 });
  });

  it('refuses to save when no exchange rate is available', async () => {
    const { service, mock } = build(false);
    await expect(
      service.create('u', { accountId: 'acc-crc', kind: 'purchase', localDate: '2026-10-14', currency: 'CRC', amountMinor: 100, merchantRaw: 'x', tagIds: [] }),
    ).rejects.toBeInstanceOf(FxUnavailableError);
    expect(mock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('rejects an unknown category', async () => {
    await expect(
      ctx.service.create('u', { accountId: 'acc-crc', kind: 'purchase', localDate: '2026-10-14', currency: 'USD', amountMinor: 100, merchantRaw: 'x', tagIds: [], categoryId: 'nope' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws AlreadyClaimedError when the row claim exists', async () => {
    ctx.mock.on(TransactWriteCommand).rejects(cancelled(['None', 'None', 'None', 'None', 'ConditionalCheckFailed']));
    const extra = { Put: { TableName: 'Ing', Item: { PK: 'USER#u', SK: 'ROWFP#x' }, ConditionExpression: 'attribute_not_exists(PK)' } };
    await expect(
      ctx.service.save('u', { accountId: 'acc-crc', localDate: '2026-10-14', kind: 'transfer', currency: 'USD', amountMinor: 100, merchantRaw: 'TEF', source: 'csv' },
        { categoryId: null, tagIds: [], categorizedBy: 'none', status: 'pending_review' }, [extra]),
    ).rejects.toBeInstanceOf(AlreadyClaimedError);
  });

  it('moves a recategorized amount between rollups and retries once on a version conflict', async () => {
    const stored: Transaction = {
      id: '20261014-abc', userId: 'u', accountId: 'acc-crc', localDate: '2026-10-14', occurredAt: null, kind: 'purchase', status: 'pending_review',
      currency: 'USD', amountMinor: 1000, amountUsdCents: 1000, fxRate: 1, fxDate: '2026-10-14', categoryId: null, tagIds: [], categorizedBy: 'none',
      merchantRaw: 'Spotify', merchantKey: 'spotify', sources: ['csv'], version: 3, createdAt: '', updatedAt: '',
    };
    ctx.mock.on(GetCommand).callsFake((input) =>
      input.Key.SK === 'TXN#2026-10-14#20261014-abc' ? { Item: { PK: 'USER#u', SK: input.Key.SK, ...stored } } : {},
    );
    ctx.mock.on(TransactWriteCommand).rejectsOnce(cancelled(['ConditionalCheckFailed'])).resolves({});
    const next = await ctx.service.update('u', '20261014-abc', { categoryId: 'groceries' });
    expect(next).toMatchObject({ categoryId: 'groceries', status: 'confirmed', categorizedBy: 'user', version: 4 });
    const calls = writes(ctx.mock);
    expect(calls).toHaveLength(2);
    const last = calls[1];
    expect(last[0].Put?.ConditionExpression).toContain('#v = :expected');
    expect(last[0].Put?.Item?.reviewPK).toBeUndefined();
    const sks = last.slice(1).map((i) => i.Update!.Key!.SK).sort();
    expect(sks).toEqual(['BUDGET#b1#D#2026-10-14', 'BUDGET#b1#P#2026-10-01', 'MONTH#2026-10#CAT#groceries', 'MONTH#2026-10#CAT#uncategorized']);
  });
});
