import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { AggregateRepository } from '../../src/repositories/aggregate-repository';
import { DynamoStore } from '../../src/repositories/dynamo-store';
import { IngestionRepository } from '../../src/repositories/ingestion-repository';
import { ReferenceRepository } from '../../src/repositories/reference-repository';
import { USER } from '../helpers';

const ddb = mockClient(DynamoDBDocumentClient);
const store = new DynamoStore(DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-2' })));

beforeEach(() => {
  ddb.reset();
  ddb.on(UpdateCommand).resolves({});
  ddb.on(PutCommand).resolves({});
  ddb.on(BatchWriteCommand).resolves({});
});

describe('DynamoStore', () => {
  it('omits empty ExpressionAttributeNames (DynamoDB rejects them)', async () => {
    await new IngestionRepository(store, 'Ingestion').markRepeat(USER, 'm1', '2026-11-11T00:00:00Z');
    const input = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(input.ExpressionAttributeNames).toBeUndefined();
    expect(input.UpdateExpression).toBe('SET lastRepeatAt = :a ADD repeats :one');
  });
});

describe('IngestionRepository', () => {
  it('claimFile is reclaimable when the last import FAILED, and false when taken', async () => {
    const repo = new IngestionRepository(store, 'Ingestion');
    expect(await repo.claimFile(USER, 'a'.repeat(64), 'imp1')).toBe(true);
    const put = ddb.commandCalls(PutCommand)[0]!.args[0].input;
    expect(put.ConditionExpression).toBe('attribute_not_exists(PK) OR #s = :failed');
    expect(put.Item).toMatchObject({ PK: `USER#${USER}`, SK: `FILE#${'a'.repeat(64)}`, status: 'UPLOADING' });
    ddb.on(PutCommand).rejects(Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' }));
    expect(await repo.claimFile(USER, 'a'.repeat(64), 'imp2')).toBe(false);
  });

  it('rowClaimItem is a conditional put returned for the save path', () => {
    const item = new IngestionRepository(store, 'Ingestion').rowClaimItem(USER, 'fp', 'imp1');
    expect(item).toEqual({
      Put: { TableName: 'Ingestion', Item: { PK: `USER#${USER}`, SK: 'ROWFP#fp', importId: 'imp1' }, ConditionExpression: 'attribute_not_exists(PK)' },
    });
  });
});

describe('ReferenceRepository', () => {
  it('finds the account that holds a card', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        { PK: 'x', SK: 'ACCOUNT#a', id: 'a', name: 'BAC colones', cardLast4s: ['1111'] },
        { PK: 'x', SK: 'ACCOUNT#b', id: 'b', name: 'BN colones', cardLast4s: ['2222'] },
      ],
    });
    const repo = new ReferenceRepository(store, 'Reference');
    expect((await repo.findAccountByCard(USER, '2222'))?.id).toBe('b');
    expect(await repo.findAccountByCard(USER, '9999')).toBeNull();
  });
});

describe('AggregateRepository', () => {
  const repo = new AggregateRepository(store, 'Aggregates');
  it('budget period deltas ADD spentCents and count and SET the limit', () => {
    const [p, d] = repo.addItems(USER, [
      { key: 'BUDGET#b1#P#2026-11-01', expenseCents: 500, incomeCents: 0, count: 1, limitCents: 9000 },
      { key: 'BUDGET#b1#D#2026-11-02', expenseCents: 500, incomeCents: 0, count: 0 },
    ]);
    expect(p!.Update!.UpdateExpression).toBe('ADD #s :s, #c :c SET #l = :l');
    expect(d!.Update!.UpdateExpression).toBe('ADD #s :s');
  });

  it('replaceBudgetItems deletes the old P# and D# items, then writes the new ones', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ PK: `USER#${USER}`, SK: 'BUDGET#b1#P#2026-10-01' }] });
    await repo.replaceBudgetItems(USER, 'b1', [{ budgetId: 'b1', periodStart: '2026-11-01', spentCents: 5, count: 1, limitCents: 9 }], []);
    const calls = ddb.commandCalls(BatchWriteCommand).map((c) => c.args[0].input.RequestItems!.Aggregates);
    expect(calls[0]).toEqual([{ DeleteRequest: { Key: { PK: `USER#${USER}`, SK: 'BUDGET#b1#P#2026-10-01' } } }]);
    expect(calls[1]![0]!.PutRequest!.Item).toMatchObject({ SK: 'BUDGET#b1#P#2026-11-01', spentCents: 5, limitCents: 9 });
  });
});
