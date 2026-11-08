import type {
  BrokerCash,
  BudgetDayTotal,
  BudgetPeriodTotal,
  FxRate,
  Holding,
  InvestmentMonthRollup,
  Price,
  RollupDimension,
  SpendingRollup,
} from "@finance/shared";
import { Keys } from "../keys";
import type { RollupDelta } from "../transactions/rollup-delta";
import { DynamoStore, stripKeys, type Item, type TransactItem } from "./dynamo-store";

/** How long a cached price item is kept before DynamoDB TTL may remove it. Freshness (15 min) is checked separately. */
export const PRICE_ITEM_RETENTION_SECONDS = 7 * 24 * 3600;

export interface HoldingChange {
  quantityMicro: number;
  costBasisCents: number;
  realizedGainCents: number;
}

export type InvestmentMonthChange = Partial<Omit<InvestmentMonthRollup, "month">>;

/** Aggregates table: spending rollups, budget totals, holdings, broker cash, FX rates, prices. */
export class AggregateRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  // ---------- Spending rollups ----------

  async getMonth(userId: string, month: string, dimension: "CAT" | "TAG"): Promise<SpendingRollup[]> {
    const items = await this.store.query(this.table, { pk: Keys.user(userId), beginsWith: Keys.monthPrefix(month, dimension) });
    return items.map(toRollup);
  }

  /** The `MONTH#<m>#TOTAL` item of each month that has one. */
  async getMonths(userId: string, months: string[]): Promise<SpendingRollup[]> {
    const items = await this.store.batchGet(
      this.table,
      months.map((m) => ({ PK: Keys.user(userId), SK: Keys.month(m, "TOTAL") })),
    );
    return items.map(toRollup);
  }

  /** Turns rollup deltas into `ADD` updates for one TransactWriteItems. Deltas on the same key are combined. */
  addItems(userId: string, deltas: RollupDelta[]): TransactItem[] {
    const merged = new Map<string, RollupDelta>();
    for (const d of deltas) {
      const prev = merged.get(d.key);
      if (prev) {
        prev.expenseCents += d.expenseCents;
        prev.incomeCents += d.incomeCents;
        prev.count += d.count;
        if (d.limitCents !== undefined) prev.limitCents = d.limitCents;
      } else {
        merged.set(d.key, { ...d });
      }
    }
    const items: TransactItem[] = [];
    for (const d of merged.values()) {
      if (d.expenseCents === 0 && d.incomeCents === 0 && d.count === 0) continue;
      items.push(this.deltaItem(userId, d));
    }
    return items;
  }

  private deltaItem(userId: string, d: RollupDelta): TransactItem {
    const Key = { PK: Keys.user(userId), SK: d.key };
    const budgetPeriod = /^BUDGET#(.+)#P#(\d{4}-\d{2}-\d{2})$/.exec(d.key);
    const budgetDay = /^BUDGET#(.+)#D#(\d{4}-\d{2}-\d{2})$/.exec(d.key);
    if (budgetPeriod) {
      return {
        Update: {
          TableName: this.table,
          Key,
          UpdateExpression: "ADD spentCents :e, #count :c SET budgetId = :b, periodStart = :p, limitCents = :l",
          ExpressionAttributeNames: { "#count": "count" },
          ExpressionAttributeValues: {
            ":e": d.expenseCents,
            ":c": d.count,
            ":b": budgetPeriod[1],
            ":p": budgetPeriod[2],
            ":l": d.limitCents ?? 0,
          },
        },
      };
    }
    if (budgetDay) {
      return {
        Update: {
          TableName: this.table,
          Key,
          UpdateExpression: "ADD spentCents :e SET budgetId = :b, #date = :d",
          ExpressionAttributeNames: { "#date": "date" },
          ExpressionAttributeValues: { ":e": d.expenseCents, ":b": budgetDay[1], ":d": budgetDay[2] },
        },
      };
    }
    return {
      Update: {
        TableName: this.table,
        Key,
        UpdateExpression: "ADD expenseCents :e, incomeCents :i, #count :c",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: { ":e": d.expenseCents, ":i": d.incomeCents, ":c": d.count },
      },
    };
  }

  // ---------- Budget totals ----------

  async getBudgetPeriods(userId: string, keys: { budgetId: string; periodStart: string }[]): Promise<BudgetPeriodTotal[]> {
    if (keys.length === 0) return [];
    const items = await this.store.batchGet(
      this.table,
      keys.map((k) => ({ PK: Keys.user(userId), SK: Keys.budgetPeriod(k.budgetId, k.periodStart) })),
    );
    return items.map((i) => ({
      budgetId: String(i.budgetId),
      periodStart: String(i.periodStart),
      spentCents: Number(i.spentCents ?? 0),
      count: Number(i.count ?? 0),
      limitCents: Number(i.limitCents ?? 0),
    }));
  }

  async getBudgetDays(userId: string, budgetId: string, from: string, to: string): Promise<BudgetDayTotal[]> {
    const items = await this.store.query(this.table, {
      pk: Keys.user(userId),
      between: [Keys.budgetDay(budgetId, from), Keys.budgetDay(budgetId, to)],
    });
    return items.map((i) => ({ budgetId, date: String(i.date), spentCents: Number(i.spentCents ?? 0) }));
  }

  /** Deletes every `BUDGET#id#P#` and `#D#` item of a budget and writes the rebuilt ones. */
  async replaceBudgetItems(userId: string, budgetId: string, periods: BudgetPeriodTotal[], days: BudgetDayTotal[]): Promise<void> {
    const pk = Keys.user(userId);
    const existing = await this.store.query(this.table, { pk, beginsWith: Keys.budgetPrefix(budgetId) });
    const deletes = existing
      .map((i) => ({ PK: pk, SK: String(i.SK) }))
      // BUDGET#<id>#... prefix also matches IDs that extend this one; keep only P#/D# items of this budget.
      .filter((k) => k.SK.startsWith(`BUDGET#${budgetId}#P#`) || k.SK.startsWith(`BUDGET#${budgetId}#D#`));
    const puts: Item[] = [
      ...periods.map((p) => ({ PK: pk, SK: Keys.budgetPeriod(budgetId, p.periodStart), ...p })),
      ...days.map((d) => ({ PK: pk, SK: Keys.budgetDay(budgetId, d.date), ...d })),
    ];
    const putKeys = new Set(puts.map((p) => String(p.SK)));
    await this.store.batchWrite(
      this.table,
      puts,
      deletes.filter((d) => !putKeys.has(d.SK)),
    );
  }

  // ---------- Holdings, cash, investment month rollups ----------

  async getHoldings(userId: string): Promise<Holding[]> {
    const items = await this.store.query(this.table, { pk: Keys.user(userId), beginsWith: "HOLDING#" });
    return items.map((i) => ({
      brokerId: String(i.brokerId),
      ticker: String(i.ticker),
      quantityMicro: Number(i.quantityMicro ?? 0),
      costBasisCents: Number(i.costBasisCents ?? 0),
      realizedGainCents: Number(i.realizedGainCents ?? 0),
      version: Number(i.version ?? 0),
    }));
  }

  async getHolding(userId: string, brokerId: string, ticker: string): Promise<Holding | undefined> {
    const i = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.holding(brokerId, ticker) });
    if (!i) return undefined;
    return {
      brokerId,
      ticker,
      quantityMicro: Number(i.quantityMicro ?? 0),
      costBasisCents: Number(i.costBasisCents ?? 0),
      realizedGainCents: Number(i.realizedGainCents ?? 0),
      version: Number(i.version ?? 0),
    };
  }

  async getCash(userId: string): Promise<BrokerCash[]> {
    const items = await this.store.query(this.table, { pk: Keys.user(userId), beginsWith: "CASH#" });
    return items.map((i) => ({ brokerId: String(i.brokerId), balanceCents: Number(i.balanceCents ?? 0) }));
  }

  /** Writes a rebuilt holding, guarded by the version that was read (0 = must not exist yet). */
  async putHolding(userId: string, holding: Holding, expectedVersion: number): Promise<void> {
    await this.store.transactWrite([this.putHoldingItem(userId, holding, expectedVersion)]);
  }

  putHoldingItem(userId: string, holding: Holding, expectedVersion: number): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: { PK: Keys.user(userId), SK: Keys.holding(holding.brokerId, holding.ticker), ...holding, version: expectedVersion + 1 },
        ConditionExpression: expectedVersion === 0 ? "attribute_not_exists(PK) OR #v = :zero" : "#v = :expected",
        ExpressionAttributeNames: { "#v": "version" },
        ExpressionAttributeValues: expectedVersion === 0 ? { ":zero": 0 } : { ":expected": expectedVersion },
      },
    };
  }

  /**
   * ADD to a holding. For a sale, pass the version read and the quantity sold, so the write is
   * rejected when the holding changed or holds fewer units than are being sold.
   */
  holdingAddItem(
    userId: string,
    brokerId: string,
    ticker: string,
    change: HoldingChange,
    guard?: { expectedVersion: number; minQuantityMicro: number },
  ): TransactItem {
    const values: Record<string, unknown> = {
      ":q": change.quantityMicro,
      ":c": change.costBasisCents,
      ":g": change.realizedGainCents,
      ":one": 1,
      ":b": brokerId,
      ":t": ticker,
    };
    let condition: string | undefined;
    if (guard) {
      condition = "#v = :expected AND quantityMicro >= :min";
      values[":expected"] = guard.expectedVersion;
      values[":min"] = guard.minQuantityMicro;
    }
    return {
      Update: {
        TableName: this.table,
        Key: { PK: Keys.user(userId), SK: Keys.holding(brokerId, ticker) },
        UpdateExpression: "ADD quantityMicro :q, costBasisCents :c, realizedGainCents :g, #v :one SET brokerId = :b, ticker = :t",
        ConditionExpression: condition,
        ExpressionAttributeNames: { "#v": "version" },
        ExpressionAttributeValues: values,
      },
    };
  }

  cashAddItem(userId: string, brokerId: string, deltaCents: number): TransactItem {
    return {
      Update: {
        TableName: this.table,
        Key: { PK: Keys.user(userId), SK: Keys.cash(brokerId) },
        UpdateExpression: "ADD balanceCents :d SET brokerId = :b",
        ExpressionAttributeValues: { ":d": deltaCents, ":b": brokerId },
      },
    };
  }

  investmentMonthAddItem(userId: string, month: string, change: InvestmentMonthChange): TransactItem | undefined {
    const entries = Object.entries(change).filter(([, v]) => typeof v === "number" && v !== 0) as [string, number][];
    if (entries.length === 0) return undefined;
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = { ":m": month };
    const parts = entries.map(([k, v], i) => {
      names[`#f${i}`] = k;
      values[`:v${i}`] = v;
      return `#f${i} :v${i}`;
    });
    return {
      Update: {
        TableName: this.table,
        Key: { PK: Keys.user(userId), SK: Keys.month(month, "INV") },
        UpdateExpression: `ADD ${parts.join(", ")} SET #month = :m`,
        ExpressionAttributeNames: { ...names, "#month": "month" },
        ExpressionAttributeValues: values,
      },
    };
  }

  // ---------- FX rates (global) ----------

  async getFxRate(date: string): Promise<FxRate | undefined> {
    const item = await this.store.get(this.table, { PK: Keys.fx(date), SK: Keys.ITEM });
    if (!item) return undefined;
    return { date, rate: Number(item.rate), rateDate: String(item.rateDate), source: String(item.source) };
  }

  async putFxRate(rate: FxRate): Promise<void> {
    await this.store.put(this.table, { PK: Keys.fx(rate.date), SK: Keys.ITEM, ...rate });
  }

  // ---------- Prices (global, TTL) ----------

  async getPrices(tickers: string[]): Promise<Price[]> {
    if (tickers.length === 0) return [];
    const items = await this.store.batchGet(
      this.table,
      tickers.map((t) => ({ PK: Keys.price(t), SK: Keys.ITEM })),
    );
    return items.map((i) => ({
      ticker: String(i.ticker),
      priceCents: Number(i.priceCents),
      retrievedAt: String(i.retrievedAt),
      stale: false,
    }));
  }

  async putPrice(price: Price): Promise<void> {
    const ttl = Math.floor(Date.parse(price.retrievedAt) / 1000) + PRICE_ITEM_RETENTION_SECONDS;
    await this.store.put(this.table, {
      PK: Keys.price(price.ticker),
      SK: Keys.ITEM,
      ticker: price.ticker,
      priceCents: price.priceCents,
      retrievedAt: price.retrievedAt,
      ttl,
    });
  }
}

function toRollup(item: Item): SpendingRollup {
  const sk = String(item.SK);
  const m = /^(?:MONTH|DAY)#([^#]+)#(TOTAL|CAT|TAG)(?:#(.+))?$/.exec(sk);
  const base = stripKeys<Record<string, unknown>>(item);
  return {
    bucket: m?.[1] ?? "",
    dimension: (m?.[2] ?? "TOTAL") as RollupDimension,
    dimensionId: m?.[3],
    expenseCents: Number(base.expenseCents ?? 0),
    incomeCents: Number(base.incomeCents ?? 0),
    count: Number(base.count ?? 0),
  };
}
