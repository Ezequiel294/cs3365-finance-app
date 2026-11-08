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
} from "@aws-sdk/lib-dynamodb";
import { ConflictError } from "../http/errors";

export type Item = Record<string, unknown>;
export type Key = { PK: string; SK: string } & Record<string, string>;
export type TransactItem = NonNullable<TransactWriteCommandInput["TransactItems"]>[number];

export interface KeyCondition {
  /** Partition key attribute name, `PK` by default (or the index's key). */
  pkName?: string;
  pk: string;
  skName?: string;
  beginsWith?: string;
  between?: [string, string];
  equals?: string;
}

export interface QueryOptions {
  index?: string;
  filter?: { expression: string; names?: Record<string, string>; values?: Record<string, unknown> };
  limit?: number;
  forward?: boolean;
}

export interface Condition {
  expression: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export interface UpdateExpression {
  expression: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

/** True when a DynamoDB call failed only because a condition was not met. */
export function isConditionFailure(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === "ConditionalCheckFailedException";
}

/**
 * The only class that talks to DynamoDB. Repositories build keys and items; this class
 * runs the calls, pages through results, and retries unprocessed batch items.
 */
export class DynamoStore {
  constructor(private readonly client: DynamoDBDocumentClient) {}

  async get(table: string, key: Key): Promise<Item | undefined> {
    const out = await this.client.send(new GetCommand({ TableName: table, Key: key }));
    return out.Item as Item | undefined;
  }

  async query(table: string, keyCondition: KeyCondition, options: QueryOptions = {}): Promise<Item[]> {
    const names: Record<string, string> = { "#pk": keyCondition.pkName ?? "PK", ...(options.filter?.names ?? {}) };
    const values: Record<string, unknown> = { ":pk": keyCondition.pk, ...(options.filter?.values ?? {}) };
    let expression = "#pk = :pk";
    const skName = keyCondition.skName ?? "SK";
    if (keyCondition.beginsWith !== undefined) {
      names["#sk"] = skName;
      values[":sk"] = keyCondition.beginsWith;
      expression += " AND begins_with(#sk, :sk)";
    } else if (keyCondition.between) {
      names["#sk"] = skName;
      values[":sk1"] = keyCondition.between[0];
      values[":sk2"] = keyCondition.between[1];
      expression += " AND #sk BETWEEN :sk1 AND :sk2";
    } else if (keyCondition.equals !== undefined) {
      names["#sk"] = skName;
      values[":sk"] = keyCondition.equals;
      expression += " AND #sk = :sk";
    }
    const items: Item[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const out = await this.client.send(
        new QueryCommand({
          TableName: table,
          IndexName: options.index,
          KeyConditionExpression: expression,
          FilterExpression: options.filter?.expression,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ScanIndexForward: options.forward ?? true,
          ExclusiveStartKey: startKey,
          Limit: options.limit,
        }),
      );
      items.push(...((out.Items ?? []) as Item[]));
      startKey = out.LastEvaluatedKey;
      if (options.limit && items.length >= options.limit) break;
    } while (startKey);
    return options.limit ? items.slice(0, options.limit) : items;
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

  async update(table: string, key: Key, update: UpdateExpression, condition?: Condition): Promise<Item | undefined> {
    const names = { ...(update.names ?? {}), ...(condition?.names ?? {}) };
    const values = { ...(update.values ?? {}), ...(condition?.values ?? {}) };
    const out = await this.client.send(
      new UpdateCommand({
        TableName: table,
        Key: key,
        UpdateExpression: update.expression,
        ConditionExpression: condition?.expression,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: Object.keys(values).length ? values : undefined,
        ReturnValues: "ALL_NEW",
      }),
    );
    return out.Attributes as Item | undefined;
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
    const items: Item[] = [];
    for (let i = 0; i < unique.length; i += 100) {
      let pending: Record<string, unknown>[] = unique.slice(i, i + 100);
      for (let attempt = 0; pending.length > 0 && attempt < 5; attempt++) {
        if (attempt > 0) await sleep(50 * 2 ** attempt);
        const out = await this.client.send(new BatchGetCommand({ RequestItems: { [table]: { Keys: pending } } }));
        items.push(...((out.Responses?.[table] ?? []) as Item[]));
        pending = (out.UnprocessedKeys?.[table]?.Keys ?? []) as Record<string, unknown>[];
      }
      if (pending.length > 0) throw new Error("BatchGet left unprocessed keys after retries");
    }
    return items;
  }

  async batchWrite(table: string, puts: Item[], deletes: Key[] = []): Promise<void> {
    type WriteRequest = { PutRequest?: { Item: Item }; DeleteRequest?: { Key: Key } };
    const requests: WriteRequest[] = [
      ...deletes.map((Key) => ({ DeleteRequest: { Key } })),
      ...puts.map((Item) => ({ PutRequest: { Item } })),
    ];
    for (let i = 0; i < requests.length; i += 25) {
      let pending = requests.slice(i, i + 25);
      for (let attempt = 0; pending.length > 0 && attempt < 6; attempt++) {
        if (attempt > 0) await sleep(50 * 2 ** attempt);
        const out = await this.client.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
        pending = (out.UnprocessedItems?.[table] ?? []) as WriteRequest[];
      }
      if (pending.length > 0) throw new Error("BatchWrite left unprocessed items after retries");
    }
  }

  /**
   * One atomic TransactWriteItems. A failed condition or a concurrent write cancels the whole
   * call and is reported as `ConflictError`, so callers can re-read and retry.
   */
  async transactWrite(items: TransactItem[]): Promise<void> {
    if (items.length === 0) return;
    if (items.length > 100) throw new Error(`TransactWriteItems supports 100 items, got ${items.length}`);
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: items }));
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === "TransactionCanceledException" || name === "TransactionConflictException") {
        throw new ConflictError();
      }
      throw error;
    }
  }
}

function dedupeKeys(keys: Key[]): Key[] {
  const seen = new Set<string>();
  return keys.filter((k) => {
    const id = `${k.PK}\u0000${k.SK}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Removes key attributes so services never see key strings. */
export function stripKeys<T>(item: Item, extra: string[] = []): T {
  const copy: Item = { ...item };
  for (const k of ["PK", "SK", "reviewPK", "reviewSK", "tickerPK", ...extra]) delete copy[k];
  return copy as T;
}
