import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';

export type Item = Record<string, any>;
export type Key = { PK: string; SK: string };
export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

export interface Expression {
  update?: string;
  condition?: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export interface QueryOptions {
  names?: Record<string, string>;
  values: Record<string, unknown>;
  indexName?: string;
  filter?: string;
  limit?: number;
  scanForward?: boolean;
  consistent?: boolean;
  exclusiveStartKey?: Item;
}

export interface Page {
  items: Item[];
  lastKey?: Item;
}

/** A conditional write whose condition did not hold. */
export class ConditionFailedError extends Error {
  constructor() {
    super('Condition failed');
    this.name = 'ConditionFailedError';
  }
}

/** A `TransactWriteItems` that DynamoDB cancelled. `reasons[i]` is the code for item `i`. */
export class TransactionCancelledError extends Error {
  constructor(readonly reasons: string[]) {
    super(`Transaction cancelled: ${reasons.join(',')}`);
    this.name = 'TransactionCancelledError';
  }

  conditionFailedAt(): number[] {
    return this.reasons.flatMap((r, i) => (r === 'ConditionalCheckFailed' ? [i] : []));
  }

  isConflict(): boolean {
    return this.reasons.some((r) => r === 'TransactionConflict');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isConditionFailure(err: unknown): boolean {
  return (err as { name?: string })?.name === 'ConditionalCheckFailedException';
}

/** The only class that talks to DynamoDB. Repositories are built on it. */
export class DynamoStore {
  constructor(readonly client: DynamoDBDocumentClient) {}

  static create(): DynamoStore {
    const base = new DynamoDBClient({});
    return new DynamoStore(
      DynamoDBDocumentClient.from(base, { marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true } }),
    );
  }

  async get(table: string, key: Key, consistent = false): Promise<Item | undefined> {
    const out = await this.client.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: consistent }));
    return out.Item;
  }

  async query(table: string, keyCondition: string, options: QueryOptions): Promise<Page> {
    const out = await this.client.send(
      new QueryCommand({
        TableName: table,
        IndexName: options.indexName,
        KeyConditionExpression: keyCondition,
        FilterExpression: options.filter,
        ExpressionAttributeNames: options.names,
        ExpressionAttributeValues: options.values,
        Limit: options.limit,
        ScanIndexForward: options.scanForward,
        ConsistentRead: options.consistent,
        ExclusiveStartKey: options.exclusiveStartKey,
      }),
    );
    return { items: out.Items ?? [], lastKey: out.LastEvaluatedKey };
  }

  /** Follows `LastEvaluatedKey` until every page is read. */
  async queryAll(table: string, keyCondition: string, options: QueryOptions): Promise<Item[]> {
    const items: Item[] = [];
    let start: Item | undefined;
    do {
      const page = await this.query(table, keyCondition, { ...options, exclusiveStartKey: start });
      items.push(...page.items);
      start = page.lastKey;
    } while (start);
    return items;
  }

  /** Puts an item. Throws `ConditionFailedError` when `condition` does not hold. */
  async put(table: string, item: Item, condition?: Expression): Promise<void> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: table,
          Item: item,
          ConditionExpression: condition?.condition,
          ExpressionAttributeNames: condition?.names,
          ExpressionAttributeValues: condition?.values,
        }),
      );
    } catch (err) {
      if (isConditionFailure(err)) throw new ConditionFailedError();
      throw err;
    }
  }

  /** Updates an item and returns its new attributes. Throws `ConditionFailedError` on a failed condition. */
  async update(table: string, key: Key, expression: Expression): Promise<Item | undefined> {
    try {
      const out = await this.client.send(
        new UpdateCommand({
          TableName: table,
          Key: key,
          UpdateExpression: expression.update,
          ConditionExpression: expression.condition,
          ExpressionAttributeNames: expression.names,
          ExpressionAttributeValues: expression.values,
          ReturnValues: 'ALL_NEW',
        }),
      );
      return out.Attributes;
    } catch (err) {
      if (isConditionFailure(err)) throw new ConditionFailedError();
      throw err;
    }
  }

  async delete(table: string, key: Key, condition?: Expression): Promise<void> {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: table,
          Key: key,
          ConditionExpression: condition?.condition,
          ExpressionAttributeNames: condition?.names,
          ExpressionAttributeValues: condition?.values,
        }),
      );
    } catch (err) {
      if (isConditionFailure(err)) throw new ConditionFailedError();
      throw err;
    }
  }

  async batchGet(table: string, keys: Key[]): Promise<Item[]> {
    const unique = [...new Map(keys.map((k) => [`${k.PK}|${k.SK}`, k])).values()];
    const items: Item[] = [];
    for (let i = 0; i < unique.length; i += 100) {
      let pending: Record<string, any>[] = unique.slice(i, i + 100);
      for (let attempt = 0; pending.length > 0 && attempt < 5; attempt++) {
        if (attempt > 0) await sleep(50 * 2 ** attempt);
        const out = await this.client.send(new BatchGetCommand({ RequestItems: { [table]: { Keys: pending } } }));
        items.push(...(out.Responses?.[table] ?? []));
        pending = (out.UnprocessedKeys?.[table]?.Keys as Record<string, any>[]) ?? [];
      }
      if (pending.length > 0) throw new Error('BatchGet left unprocessed keys');
    }
    return items;
  }

  async batchWrite(table: string, puts: Item[], deletes: Key[]): Promise<void> {
    const requests: Record<string, any>[] = [
      ...puts.map((Item) => ({ PutRequest: { Item } })),
      ...deletes.map((Key) => ({ DeleteRequest: { Key } })),
    ];
    for (let i = 0; i < requests.length; i += 25) {
      let pending = requests.slice(i, i + 25);
      for (let attempt = 0; pending.length > 0 && attempt < 6; attempt++) {
        if (attempt > 0) await sleep(50 * 2 ** attempt);
        const out = await this.client.send(new BatchWriteCommand({ RequestItems: { [table]: pending as any } }));
        pending = (out.UnprocessedItems?.[table] as Record<string, any>[]) ?? [];
      }
      if (pending.length > 0) throw new Error('BatchWrite left unprocessed items');
    }
  }

  /** One `TransactWriteItems`. Throws `TransactionCancelledError` with a reason per item. */
  async transactWrite(items: TransactItem[]): Promise<void> {
    if (items.length === 0) return;
    if (items.length > 100) throw new Error(`TransactWriteItems supports at most 100 items, got ${items.length}`);
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: items }));
    } catch (err) {
      const e = err as { name?: string; CancellationReasons?: { Code?: string }[] };
      if (e?.name === 'TransactionCanceledException') {
        throw new TransactionCancelledError((e.CancellationReasons ?? []).map((r) => r.Code ?? 'None'));
      }
      throw err;
    }
  }
}

/** Removes `PK`, `SK`, and index keys so services never see key strings. */
export function strip<T>(item: Item | undefined): T | undefined {
  if (!item) return undefined;
  const { PK: _pk, SK: _sk, reviewPK: _r, reviewSK: _rs, tickerPK: _t, ...rest } = item;
  return rest as T;
}
