/**
 * An in-memory stand-in for DynamoDB, installed with aws-sdk-client-mock at the
 * DynamoDBDocumentClient boundary. It understands the expressions this code base uses:
 * key conditions (=, begins_with, BETWEEN), filters, ADD/SET/REMOVE updates, and condition
 * expressions with AND/OR/NOT, parentheses, comparisons, and attribute_(not_)exists.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
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
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

type Item = Record<string, unknown>;
type Names = Record<string, string> | undefined;
type Values = Record<string, unknown> | undefined;

const INDEXES: Record<string, { pk: string; sk: string }> = {
  review: { pk: "reviewPK", sk: "reviewSK" },
  ticker: { pk: "tickerPK", sk: "SK" },
};

class ConditionFailed extends Error {
  override name = "ConditionalCheckFailedException";
}

export class FakeDynamo {
  readonly tables = new Map<string, Map<string, Item>>();
  readonly mock = mockClient(DynamoDBDocumentClient);
  readonly client = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: "us-east-2", credentials: { accessKeyId: "test", secretAccessKey: "test" } }),
  );
  /** Number of TransactWriteItems calls that should fail with a conflict before succeeding. */
  failNextTransactions = 0;
  transactCalls: Item[][] = [];

  constructor() {
    this.mock.on(GetCommand).callsFake((input) => ({ Item: clone(this.table(input.TableName).get(keyOf(input.Key))) }));
    this.mock.on(PutCommand).callsFake((input) => {
      this.applyPut(input.TableName, input.Item, input);
      return {};
    });
    this.mock.on(DeleteCommand).callsFake((input) => {
      this.applyDelete(input.TableName, input.Key, input);
      return {};
    });
    this.mock.on(UpdateCommand).callsFake((input) => ({ Attributes: clone(this.applyUpdate(input.TableName, input.Key, input)) }));
    this.mock.on(QueryCommand).callsFake((input) => ({ Items: this.query(input) }));
    this.mock.on(BatchGetCommand).callsFake((input) => {
      const Responses: Record<string, Item[]> = {};
      for (const [table, req] of Object.entries(input.RequestItems ?? {}) as [string, { Keys: Item[] }][]) {
        Responses[table] = req.Keys.map((k) => this.table(table).get(keyOf(k))).filter(Boolean).map((i) => clone(i)!);
      }
      return { Responses, UnprocessedKeys: {} };
    });
    this.mock.on(BatchWriteCommand).callsFake((input) => {
      for (const [table, reqs] of Object.entries(input.RequestItems ?? {}) as [string, Item[]][]) {
        for (const r of reqs as { PutRequest?: { Item: Item }; DeleteRequest?: { Key: Item } }[]) {
          if (r.PutRequest) this.table(table).set(keyOf(r.PutRequest.Item), clone(r.PutRequest.Item)!);
          if (r.DeleteRequest) this.table(table).delete(keyOf(r.DeleteRequest.Key));
        }
      }
      return { UnprocessedItems: {} };
    });
    this.mock.on(TransactWriteCommand).callsFake((input) => {
      const items = (input.TransactItems ?? []) as Item[];
      this.transactCalls.push(items);
      if (this.failNextTransactions > 0) {
        this.failNextTransactions--;
        throw Object.assign(new Error("Transaction cancelled"), { name: "TransactionCanceledException" });
      }
      const snapshot = new Map([...this.tables].map(([n, t]) => [n, new Map([...t].map(([k, v]) => [k, clone(v)!]))]));
      try {
        const keys = new Set<string>();
        type Op = {
          TableName: string;
          Key?: Item;
          Item?: Item;
          UpdateExpression?: string;
          ConditionExpression?: string;
          ExpressionAttributeNames?: Names;
          ExpressionAttributeValues?: Values;
        };
        for (const op of items as Record<string, Op>[]) {
          const [kind, body] = Object.entries(op)[0] as [string, Op];
          const id = `${body.TableName}|${keyOf((body.Key ?? body.Item)!)}`;
          if (keys.has(id)) throw Object.assign(new Error("duplicate item in transaction"), { name: "ValidationException" });
          keys.add(id);
          if (kind === "Put") this.applyPut(body.TableName, body.Item!, body);
          else if (kind === "Delete") this.applyDelete(body.TableName, body.Key!, body);
          else if (kind === "Update") this.applyUpdate(body.TableName, body.Key!, body);
          else if (kind === "ConditionCheck") this.check(this.table(body.TableName).get(keyOf(body.Key!)), body);
        }
      } catch (error) {
        this.tables.clear();
        for (const [n, t] of snapshot) this.tables.set(n, t);
        if (error instanceof ConditionFailed) {
          throw Object.assign(new Error("Transaction cancelled"), { name: "TransactionCanceledException" });
        }
        throw error;
      }
      return {};
    });
  }

  table(name: string | undefined): Map<string, Item> {
    if (!name) throw new Error("TableName missing");
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  items(table: string): Item[] {
    return [...this.table(table).values()].map((i) => clone(i)!);
  }

  item(table: string, PK: string, SK: string): Item | undefined {
    return clone(this.table(table).get(keyOf({ PK, SK })));
  }

  put(table: string, item: Item): void {
    this.table(table).set(keyOf(item), clone(item)!);
  }

  reset(): void {
    this.mock.restore();
  }

  private applyPut(table: string | undefined, item: Item, input: { ConditionExpression?: string; ExpressionAttributeNames?: Names; ExpressionAttributeValues?: Values }) {
    const t = this.table(table);
    this.check(t.get(keyOf(item)), input);
    t.set(keyOf(item), clone(stripUndefined(item))!);
  }

  private applyDelete(table: string | undefined, key: Item, input: { ConditionExpression?: string; ExpressionAttributeNames?: Names; ExpressionAttributeValues?: Values }) {
    const t = this.table(table);
    this.check(t.get(keyOf(key)), input);
    t.delete(keyOf(key));
  }

  private applyUpdate(
    table: string | undefined,
    key: Item,
    input: { UpdateExpression?: string; ConditionExpression?: string; ExpressionAttributeNames?: Names; ExpressionAttributeValues?: Values },
  ): Item {
    const t = this.table(table);
    const existing = t.get(keyOf(key));
    this.check(existing, input);
    const item: Item = clone(existing) ?? { ...key };
    const names = input.ExpressionAttributeNames;
    const values = input.ExpressionAttributeValues ?? {};
    const expr = input.UpdateExpression ?? "";
    const sections = expr.split(/\b(ADD|SET|REMOVE)\b/).map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < sections.length; i += 2) {
      const action = sections[i];
      const body = sections[i + 1] ?? "";
      for (const part of body.split(",").map((p) => p.trim()).filter(Boolean)) {
        if (action === "ADD") {
          const [path, val] = part.split(/\s+/);
          const name = resolveName(path, names);
          item[name] = Number(item[name] ?? 0) + Number(values[val]);
        } else if (action === "SET") {
          const [path, val] = part.split("=").map((s) => s.trim());
          item[resolveName(path, names)] = clone(values[val]);
        } else if (action === "REMOVE") {
          delete item[resolveName(part, names)];
        }
      }
    }
    t.set(keyOf(item), item);
    return item;
  }

  private check(existing: Item | undefined, input: { ConditionExpression?: string; ExpressionAttributeNames?: Names; ExpressionAttributeValues?: Values }) {
    if (!input.ConditionExpression) return;
    const ok = evaluate(input.ConditionExpression, existing ?? {}, input.ExpressionAttributeNames, input.ExpressionAttributeValues);
    if (!ok) throw new ConditionFailed("The conditional request failed");
  }

  private query(input: {
    TableName?: string;
    IndexName?: string;
    KeyConditionExpression?: string;
    FilterExpression?: string;
    ExpressionAttributeNames?: Names;
    ExpressionAttributeValues?: Values;
    ScanIndexForward?: boolean;
    Limit?: number;
  }): Item[] {
    const names = input.ExpressionAttributeNames;
    const values = input.ExpressionAttributeValues ?? {};
    const keyAttrs = input.IndexName ? INDEXES[input.IndexName] : { pk: "PK", sk: "SK" };
    const kce = input.KeyConditionExpression ?? "";
    const pkName = resolveName("#pk", names);
    if (pkName !== keyAttrs.pk) throw new Error(`query on ${pkName} but index key is ${keyAttrs.pk}`);
    let items = [...this.table(input.TableName).values()].filter((i) => i[keyAttrs.pk] === values[":pk"]);
    const skName = names?.["#sk"];
    if (skName) {
      items = items.filter((i) => typeof i[skName] === "string");
      if (/begins_with/.test(kce)) items = items.filter((i) => String(i[skName]).startsWith(String(values[":sk"])));
      else if (/BETWEEN/.test(kce)) items = items.filter((i) => String(i[skName]) >= String(values[":sk1"]) && String(i[skName]) <= String(values[":sk2"]));
      else items = items.filter((i) => i[skName] === values[":sk"]);
    }
    const sortKey = skName ?? keyAttrs.sk;
    items.sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])));
    if (input.ScanIndexForward === false) items.reverse();
    if (input.FilterExpression) items = items.filter((i) => evaluate(input.FilterExpression!, i, names, values));
    if (input.Limit) items = items.slice(0, input.Limit);
    return items.map((i) => clone(i)!);
  }
}

function keyOf(item: Item): string {
  return `${String(item.PK)}\u0000${String(item.SK)}`;
}

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function stripUndefined(item: Item): Item {
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined));
}

function resolveName(path: string, names: Names): string {
  return path.startsWith("#") ? (names?.[path] ?? path) : path;
}

// ---------- condition expression evaluator ----------

type Token = string;

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  const re = /\s*(<>|<=|>=|=|<|>|\(|\)|,|[A-Za-z_#:][A-Za-z0-9_#:.]*)/y;
  let m: RegExpExecArray | null;
  let pos = 0;
  while (pos < expr.length) {
    re.lastIndex = pos;
    m = re.exec(expr);
    if (!m) {
      if (/^\s*$/.test(expr.slice(pos))) break;
      throw new Error(`cannot tokenize condition at "${expr.slice(pos)}"`);
    }
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

function evaluate(expr: string, item: Item, names: Names, values: Values): boolean {
  const tokens = tokenize(expr);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const operand = (tok: string): unknown => (tok.startsWith(":") ? values?.[tok] : item[resolveName(tok, names)]);

  function primary(): boolean {
    const tok = next();
    if (tok === "(") {
      const v = or();
      next(); // )
      return v;
    }
    if (tok.toUpperCase() === "NOT") return !primary();
    if (tok === "attribute_exists" || tok === "attribute_not_exists" || tok === "begins_with") {
      next(); // (
      const a = next();
      let b: string | undefined;
      if (peek() === ",") {
        next();
        b = next();
      }
      next(); // )
      const value = item[resolveName(a, names)];
      if (tok === "attribute_exists") return value !== undefined;
      if (tok === "attribute_not_exists") return value === undefined;
      return typeof value === "string" && value.startsWith(String(operand(b!)));
    }
    const left = operand(tok);
    const op = next();
    const right = operand(next());
    switch (op) {
      case "=":
        return left === right;
      case "<>":
        return left !== right;
      case "<":
        return left !== undefined && (left as number) < (right as number);
      case "<=":
        return left !== undefined && (left as number) <= (right as number);
      case ">":
        return left !== undefined && (left as number) > (right as number);
      case ">=":
        return left !== undefined && (left as number) >= (right as number);
      default:
        throw new Error(`unsupported operator ${op}`);
    }
  }
  function and(): boolean {
    let v = primary();
    while (peek()?.toUpperCase() === "AND") {
      next();
      const r = primary();
      v = v && r;
    }
    return v;
  }
  function or(): boolean {
    let v = and();
    while (peek()?.toUpperCase() === "OR") {
      next();
      const r = and();
      v = v || r;
    }
    return v;
  }
  return or();
}
