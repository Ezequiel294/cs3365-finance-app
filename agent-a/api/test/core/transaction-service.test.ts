import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { BudgetMatcher } from '../../src/budgets/budget-matcher';
import { Categorizer } from '../../src/categorization/categorizer';
import { Normalizer } from '../../src/categorization/normalizer';
import { FixedClock } from '../../src/clock';
import { RollupPlanner } from '../../src/core/rollup-planner';
import { TransactionService } from '../../src/core/transaction-service';
import { ConflictError, FxUnavailableError, ValidationError } from '../../src/http/errors';
import { AggregateRepository } from '../../src/repositories/aggregate-repository';
import { DynamoStore } from '../../src/repositories/dynamo-store';
import { ReferenceRepository } from '../../src/repositories/reference-repository';
import { TransactionRepository } from '../../src/repositories/transaction-repository';
import { USER, txn } from '../helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' }));

function service(fx: any = null) {
  const store = new DynamoStore(doc);
  const reference = new ReferenceRepository(store, 'Reference');
  return new TransactionService({
    fx: fx ?? {
      toUsd: async (amount: number, currency: string, date: string) =>
        currency === 'USD'
          ? { amountUsdCents: amount, fxRate: 1, fxDate: date }
          : { amountUsdCents: Math.round(amount / 510.95), fxRate: 510.95, fxDate: date },
    },
    normalizer: new Normalizer(),
    categorizer: new Categorizer(reference),
    budgetMatcher: new BudgetMatcher(),
    planner: new RollupPlanner(),
    reference,
    transactions: new TransactionRepository(store, 'Transactions'),
    aggregates: new AggregateRepository(store, 'Aggregates'),
    store,
    clock: new FixedClock(new Date('2026-10-14T18:00:00Z')),
  });
}

const account = { PK: `USER#${USER}`, SK: 'ACCOUNT#acc-1', id: 'acc-1', name: 'BAC colones', bank: 'BAC', currency: 'CRC', iban: null, cardLast4s: [], version: 1 };
const budget = { PK: `USER#${USER}`, SK: 'BUDGET#b1', id: 'b1', name: 'Food', categoryIds: ['groceries'], tagIds: [], period: 'MONTHLY', limitCents: 30000, startDate: null, endDate: null, version: 1 };

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand, { TableName: 'Reference' }).resolves({});
  ddb.on(GetCommand, { TableName: 'Reference', Key: { PK: `USER#${USER}`, SK: 'ACCOUNT#acc-1' } }).resolves({ Item: account });
  ddb.on(QueryCommand, { TableName: 'Reference' }).resolves({ Items: [budget] });
  ddb.on(BatchGetCommand).callsFake((input) => {
    const keys = input.RequestItems.Reference.Keys as Array<{ PK: string; SK: string }>;
    const items = keys
      .filter((k) => k.PK === 'GLOBAL' && ['CAT#groceries', 'CAT#subscriptions'].includes(k.SK))
      .map((k) => ({ ...k, id: k.SK.slice(4), name: k.SK.slice(4), scope: 'global', archived: false }));
    return { Responses: { Reference: items } };
  });
  ddb.on(TransactWriteCommand).resolves({});
});

describe('TransactionService.create (01-S03, 01-S05)', () => {
  it('converts, categorizes, and writes the transaction with its rollups in one TransactWriteItems', async () => {
    const t = await service().create(USER, {
      accountId: 'acc-1',
      kind: 'purchase',
      amountMinor: 1400000,
      currency: 'CRC',
      localDate: '2026-10-14',
      merchantRaw: 'Feria del agricultor',
      categoryId: 'groceries',
    });
    expect(t).toMatchObject({ amountUsdCents: 2740, fxRate: 510.95, categoryId: 'groceries', categorizedBy: 'user', status: 'confirmed' });
    expect(t.id).toMatch(/^20261014-/);
    const calls = ddb.commandCalls(TransactWriteCommand);
    expect(calls).toHaveLength(1);
    const items = calls[0]!.args[0].input.TransactItems!;
    expect(items[0]!.Put!.Item!.SK).toBe(`TXN#2026-10-14#${t.id}`);
    expect(items[0]!.Put!.ConditionExpression).toBe('attribute_not_exists(PK)');
    const keys = items.slice(1).map((i) => i.Update!.Key!.SK);
    expect(keys).toEqual(
      expect.arrayContaining(['DAY#2026-10-14#TOTAL', 'MONTH#2026-10#TOTAL', 'MONTH#2026-10#CAT#groceries', 'BUDGET#b1#P#2026-10-01', 'BUDGET#b1#D#2026-10-14']),
    );
  });

  it('without a rule the entry waits in the review inbox', async () => {
    const t = await service().create(USER, {
      accountId: 'acc-1',
      kind: 'income',
      amountMinor: 50000,
      currency: 'USD',
      localDate: '2026-10-14',
      merchantRaw: 'Client payment',
    });
    expect(t).toMatchObject({ categoryId: null, status: 'pending_review', reviewReason: 'UNCATEGORIZED' });
    const put = ddb.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems![0]!.Put!.Item!;
    expect(put.reviewPK).toBe(`USER#${USER}`);
  });

  it('refuses an unknown category', async () => {
    await expect(
      service().create(USER, { accountId: 'acc-1', kind: 'purchase', amountMinor: 1, currency: 'USD', localDate: '2026-10-14', merchantRaw: 'x', categoryId: 'nope' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('a missing rate saves nothing (503)', async () => {
    const svc = service({ toUsd: async () => { throw new FxUnavailableError('2026-10-14'); } });
    await expect(
      svc.create(USER, { accountId: 'acc-1', kind: 'purchase', amountMinor: 100, currency: 'CRC', localDate: '2026-10-14', merchantRaw: 'x' }),
    ).rejects.toBeInstanceOf(FxUnavailableError);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});

describe('TransactionService.update (02-S02)', () => {
  const stored = txn({ id: '20261014-aaaaaaaaaaaa', categoryId: null, categorizedBy: 'none', reviewReason: 'UNCATEGORIZED', status: 'pending_review' });

  it('moves the amount between category rollups with a version condition and clears the review flag', async () => {
    ddb.on(GetCommand, { TableName: 'Transactions' }).resolves({ Item: { PK: `USER#${USER}`, SK: 'TXN#2026-10-14#20261014-aaaaaaaaaaaa', ...stored } });
    const next = await service().update(USER, stored.id, { categoryId: 'groceries' });
    expect(next).toMatchObject({ categoryId: 'groceries', categorizedBy: 'user', version: 2, reviewReason: null, status: 'confirmed' });
    const items = ddb.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;
    expect(items[0]!.Put!.ConditionExpression).toBe('#v = :v');
    expect(items[0]!.Put!.ExpressionAttributeValues).toEqual({ ':v': 1 });
    expect(items[0]!.Put!.Item!.reviewPK).toBeUndefined();
    const deltas = Object.fromEntries(items.slice(1).map((i) => [i.Update!.Key!.SK, i.Update!.ExpressionAttributeValues]));
    expect(deltas['MONTH#2026-10#CAT#uncategorized']).toMatchObject({ ':e': -5000 });
    expect(deltas['MONTH#2026-10#CAT#groceries']).toMatchObject({ ':e': 5000 });
    expect(deltas['BUDGET#b1#P#2026-10-01']).toMatchObject({ ':s': 5000 });
  });

  it('re-reads and retries once on a version race, then returns 409', async () => {
    ddb.on(GetCommand, { TableName: 'Transactions' }).resolves({ Item: { PK: 'x', SK: 'y', ...stored } });
    const cancelled = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    ddb.on(TransactWriteCommand).rejects(cancelled);
    await expect(service().update(USER, stored.id, { categoryId: 'groceries' })).rejects.toBeInstanceOf(ConflictError);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(2);
  });
});

describe('TransactionService.merge (01-S04)', () => {
  it('keeps the user category, combines sources, deletes the other, and subtracts it from rollups', async () => {
    const keep = txn({ id: '20261014-keepkeepkeep', categoryId: 'groceries', categorizedBy: 'user', sources: ['csv'], statementRef: '111' });
    const drop = txn({ id: '20261014-dropdropdrop', categoryId: 'subscriptions', sources: ['gmail'], amountMinor: 5100, amountUsdCents: 5100, possibleDuplicateOf: keep.id, reviewReason: 'DUPLICATE', occurredAt: '2026-10-14T10:00:00-06:00', merchantRaw: 'AUTOMERCADO ESCAZU' });
    ddb.on(GetCommand, { TableName: 'Transactions', Key: { PK: `USER#${USER}`, SK: `TXN#2026-10-14#${keep.id}` } }).resolves({ Item: keep });
    ddb.on(GetCommand, { TableName: 'Transactions', Key: { PK: `USER#${USER}`, SK: `TXN#2026-10-14#${drop.id}` } }).resolves({ Item: drop });
    const merged = await service().merge(USER, keep.id, drop.id);
    expect(merged).toMatchObject({ categoryId: 'groceries', sources: ['csv', 'gmail'], occurredAt: '2026-10-14T10:00:00-06:00', merchantRaw: 'AUTOMERCADO ESCAZU', possibleDuplicateOf: null, version: 2 });
    const items = ddb.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;
    expect(items[0]!.Put).toBeDefined();
    expect(items[1]!.Delete!.Key!.SK).toBe(`TXN#2026-10-14#${drop.id}`);
    const total = items.find((i) => i.Update?.Key?.SK === 'MONTH#2026-10#TOTAL')!;
    expect(total.Update!.ExpressionAttributeValues).toMatchObject({ ':e': -5100, ':c': -1 });
  });
});
