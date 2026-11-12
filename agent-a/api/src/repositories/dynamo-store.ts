import type { DynamoDBDocumentClient, TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export type Item = Record<string, any>;
export type Key = { PK: string; SK: string };
export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

export interface QueryOptions {
  indexName?: string;
  filter?: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
  limit?: number;
  scanForward?: boolean;
  /** Read every page (default true). */
  all?: boolean;
}

export interface Condition {
  expression: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

/** The thin wrapper every repository uses; the only class that talks to DynamoDB. */
export class DynamoStore {
  constructor(private readonly client: DynamoDBDocumentClient) {}

  async get(table: string, key: Key, consistent = false): Promise<Item | null> {
    const out = await this.client.send(
      new GetCommand({ TableName: table, Key: key, ConsistentRead: consistent }),
    );
    return (out.Item as Item) ?? null;
  }

  async query(
    table: string,
    keyCondition: { expression: string; names?: Record<string, string>; values: Record<string, unknown> },
    options: QueryOptions = {},
  ): Promise<Item[]> {
    const items: Item[] = [];
    let startKey: Record<string, unknown> | undefined;
    const names = { ...(keyCondition.names ?? {}), ...(options.names ?? {}) };
    do {
      const out = await this.client.send(
        new QueryCommand({
          TableName: table,
          IndexName: options.indexName,
          KeyConditionExpression: keyCondition.expression,
          FilterExpression: options.filter,
          ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
          ExpressionAttributeValues: { ...keyCondition.values, ...(options.values ?? {}) },
          Limit: options.limit,
          ScanIndexForward: options.scanForward,
          ExclusiveStartKey: startKey,
        }),
      );
      items.push(...((out.Items as Item[]) ?? []));
      startKey = out.LastEvaluatedKey;
      if (options.all === false) break;
      if (options.limit && items.length >= options.limit) break;
    } while (startKey);
    return items;
  }

  async put(table: string, item: Item, condition?: Condition): Promise<void> {
    await this.client.send(
      new PutCommand({
        TableName: table,
        Item: item,
        ConditionExpression: condition?.expression,
        ExpressionAttributeNames: condition?.names,
        ExpressionAttributeValues: condition?.values,
      }),
    );
  }

  async update(
    table: string,
    key: Key,
    expression: { update: string; names?: Record<string, string>; values?: Record<string, unknown> },
    condition?: Condition,
  ): Promise<Item | null> {
    const names = { ...(expression.names ?? {}), ...(condition?.names ?? {}) } as Record<string, string>;
    const values = { ...(expression.values ?? {}), ...(condition?.values ?? {}) };
    const out = await this.client.send(
      new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression: expression.update,
        ConditionExpression: condition?.expression,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: Object.keys(values).length ? values : undefined,
        ReturnValues: 'ALL_NEW',
      }),
    );
    return (out.Attributes as Item) ?? null;
  }

  async delete(table: string, key: Key, condition?: Condition): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: table,
        Key: key,
        ConditionExpression: condition?.expression,
        ExpressionAttributeNames: condition?.names,
        ExpressionAttributeValues: condition?.values,
      }),
    );
  }

  async batchGet(table: string, keys: Key[]): Promise<Item[]> {
    const unique = dedupeKeys(keys);
    const results: Item[] = [];
    for (let i = 0; i < unique.length; i += 100) {
      let pending: Key[] = unique.slice(i, i + 100);
      for (let attempt = 0; pending.length && attempt < 5; attempt++) {
        const out = await this.client.send(
          new BatchGetCommand({ RequestItems: { [table]: { Keys: pending } } }),
        );
        results.push(...((out.Responses?.[table] as Item[]) ?? []));
        pending = (out.UnprocessedKeys?.[table]?.Keys as Key[]) ?? [];
        if (pending.length) await sleep(50 * 2 ** attempt);
      }
    }
    return results;
  }

  async batchWrite(table: string, puts: Item[], deletes: Key[] = []): Promise<void> {
    const requests = [
      ...puts.map((Item) => ({ PutRequest: { Item } })),
      ...deletes.map((Key) => ({ DeleteRequest: { Key } })),
    ];
    for (let i = 0; i < requests.length; i += 25) {
      let pending: any[] = requests.slice(i, i + 25);
      for (let attempt = 0; pending.length && attempt < 6; attempt++) {
        const out = await this.client.send(
          new BatchWriteCommand({ RequestItems: { [table]: pending } }),
        );
        pending = (out.UnprocessedItems?.[table] as any[]) ?? [];
        if (pending.length) await sleep(50 * 2 ** attempt);
      }
      if (pending.length) throw new Error('BatchWrite left unprocessed items');
    }
  }

  async transactWrite(items: TransactItem[]): Promise<void> {
    if (items.length === 0) return;
    if (items.length > 100) throw new Error('TransactWriteItems is limited to 100 items');
    await this.client.send(new TransactWriteCommand({ TransactItems: items }));
  }
}

function dedupeKeys(keys: Key[]): Key[] {
  const seen = new Set<string>();
  const out: Key[] = [];
  for (const k of keys) {
    const id = `${k.PK}\u0000${k.SK}`;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(k);
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function stripKeys<T = Item>(item: Item | null | undefined): T | null {
  if (!item) return null;
  const { PK, SK, reviewPK, reviewSK, tickerPK, ...rest } = item;
  void PK;
  void SK;
  void reviewPK;
  void reviewSK;
  void tickerPK;
  return rest as T;
}

export function isConditionalFailure(error: unknown): boolean {
  return (error as { name?: string })?.name === 'ConditionalCheckFailedException';
}

/** For a TransactionCanceledException, the indexes of the items whose condition failed. */
export function failedConditionIndexes(error: unknown): number[] | null {
  const e = error as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
  if (e?.name !== 'TransactionCanceledException') return null;
  const out: number[] = [];
  (e.CancellationReasons ?? []).forEach((r, i) => {
    if (r?.Code === 'ConditionalCheckFailed') out.push(i);
  });
  return out;
}
