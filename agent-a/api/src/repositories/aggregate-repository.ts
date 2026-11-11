import type {
  BrokerCash,
  BudgetDayTotal,
  BudgetPeriodTotal,
  FxRate,
  Holding,
  Price,
  SpendingRollup,
} from '@finance/shared';
import { GLOBAL_SK, Keys, type MonthDimension } from '../keys';
import type { RollupDelta } from '../services/rollup-planner';
import { DynamoStore, strip, type Item, type TransactItem } from './dynamo-store';

function toRollup(item: Item): SpendingRollup {
  const parts = String(item.SK).split('#'); // MONTH#yyyy-mm#CAT#id or DAY#date#TOTAL
  const dimension = (parts[2] ?? 'TOTAL') as SpendingRollup['dimension'];
  return {
    bucket: parts[1],
    dimension,
    dimensionId: parts.length > 3 ? parts.slice(3).join('#') : null,
    expenseCents: Number(item.expenseCents ?? 0),
    incomeCents: Number(item.incomeCents ?? 0),
    count: Number(item.count ?? 0),
  };
}

/**
 * Increments numeric fields of an item (creating it when missing) as one
 * transaction item. `set` fields are written as-is.
 */
export function addUpdate(
  table: string,
  pk: string,
  sk: string,
  add: Record<string, number>,
  set: Record<string, unknown> = {},
  condition?: { expression: string; names?: Record<string, string>; values?: Record<string, unknown> },
): TransactItem {
  const names: Record<string, string> = { ...(condition?.names ?? {}) };
  const values: Record<string, unknown> = { ...(condition?.values ?? {}) };
  const addParts: string[] = [];
  const setParts: string[] = [];
  let i = 0;
  for (const [field, value] of Object.entries(add)) {
    names[`#a${i}`] = field;
    values[`:a${i}`] = value;
    addParts.push(`#a${i} :a${i}`);
    i++;
  }
  for (const [field, value] of Object.entries(set)) {
    names[`#s${i}`] = field;
    values[`:s${i}`] = value;
    setParts.push(`#s${i} = :s${i}`);
    i++;
  }
  const update = [addParts.length ? `ADD ${addParts.join(', ')}` : '', setParts.length ? `SET ${setParts.join(', ')}` : '']
    .filter(Boolean)
    .join(' ');
  return {
    Update: {
      TableName: table,
      Key: { PK: pk, SK: sk },
      UpdateExpression: update,
      ConditionExpression: condition?.expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

export class AggregateRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  // ---------- Spending rollups ----------

  async getMonth(userId: string, month: string, dimension: MonthDimension): Promise<SpendingRollup[]> {
    const prefix = dimension === 'TOTAL' ? Keys.month(month, 'TOTAL') : `MONTH#${month}#${dimension}#`;
    const items = await this.store.queryAll(this.table, 'PK = :pk AND begins_with(SK, :p)', {
      values: { ':pk': Keys.user(userId), ':p': prefix },
    });
    return items.map(toRollup);
  }

  async getMonths(userId: string, months: string[]): Promise<SpendingRollup[]> {
    const items = await this.store.batchGet(
      this.table,
      months.map((m) => ({ PK: Keys.user(userId), SK: Keys.month(m, 'TOTAL') })),
    );
    return items.map(toRollup);
  }

  /** One `ADD` update per delta. Budget keys store the amount as `spentCents`. */
  addItems(userId: string, deltas: RollupDelta[]): TransactItem[] {
    return deltas.map((d) => {
      if (d.key.startsWith('BUDGET#')) {
        const add: Record<string, number> = { spentCents: d.expenseCents };
        if (d.key.includes('#P#')) add.count = d.count;
        const set: Record<string, unknown> = {};
        if (d.limitCents !== undefined && d.limitCents !== null) set.limitCents = d.limitCents;
        return addUpdate(this.table, Keys.user(userId), d.key, add, set);
      }
      return addUpdate(this.table, Keys.user(userId), d.key, {
        expenseCents: d.expenseCents,
        incomeCents: d.incomeCents,
        count: d.count,
      });
    });
  }

  // ---------- Budget items ----------

  async getBudgetPeriods(userId: string, keys: { budgetId: string; periodStart: string }[]): Promise<BudgetPeriodTotal[]> {
    if (keys.length === 0) return [];
    const items = await this.store.batchGet(
      this.table,
      keys.map((k) => ({ PK: Keys.user(userId), SK: Keys.budgetPeriod(k.budgetId, k.periodStart) })),
    );
    return items.map((item) => {
      const [, budgetId, , periodStart] = String(item.SK).split('#');
      return {
        budgetId,
        periodStart,
        spentCents: Number(item.spentCents ?? 0),
        count: Number(item.count ?? 0),
        limitCents: Number(item.limitCents ?? 0),
      };
    });
  }

  async getBudgetDays(userId: string, budgetId: string, from: string, to: string): Promise<BudgetDayTotal[]> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND SK BETWEEN :from AND :to', {
      values: { ':pk': Keys.user(userId), ':from': Keys.budgetDay(budgetId, from), ':to': Keys.budgetDay(budgetId, to) },
    });
    return items.map((item) => ({
      budgetId,
      date: String(item.SK).split('#')[3],
      spentCents: Number(item.spentCents ?? 0),
    }));
  }

  /** Deletes every `BUDGET#id#P#` and `#D#` item of a budget and writes the rebuilt ones. */
  async replaceBudgetItems(
    userId: string,
    budgetId: string,
    periods: BudgetPeriodTotal[],
    days: BudgetDayTotal[],
  ): Promise<void> {
    const pk = Keys.user(userId);
    const existing = await this.store.queryAll(this.table, 'PK = :pk AND begins_with(SK, :p)', {
      values: { ':pk': pk, ':p': Keys.budgetPrefix(budgetId) },
    });
    const puts: Item[] = [
      ...periods.map((p) => ({
        PK: pk,
        SK: Keys.budgetPeriod(budgetId, p.periodStart),
        spentCents: p.spentCents,
        count: p.count,
        limitCents: p.limitCents,
      })),
      ...days.map((d) => ({ PK: pk, SK: Keys.budgetDay(budgetId, d.date), spentCents: d.spentCents })),
    ];
    const newKeys = new Set(puts.map((p) => p.SK));
    const deletes = existing.filter((e) => !newKeys.has(e.SK)).map((e) => ({ PK: pk, SK: e.SK as string }));
    await this.store.batchWrite(this.table, puts, deletes);
  }

  async setBudgetLimit(userId: string, budgetId: string, periodStart: string, limitCents: number): Promise<void> {
    await this.store.update(
      this.table,
      { PK: Keys.user(userId), SK: Keys.budgetPeriod(budgetId, periodStart) },
      { update: 'SET limitCents = :l', values: { ':l': limitCents } },
    );
  }

  // ---------- Investments ----------

  async getHoldings(userId: string): Promise<Holding[]> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND begins_with(SK, :p)', {
      values: { ':pk': Keys.user(userId), ':p': 'HOLDING#' },
    });
    return items.map((i) => strip<Holding>(i)!);
  }

  async getHolding(userId: string, brokerId: string, ticker: string): Promise<Holding | undefined> {
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.holding(brokerId, ticker) }, true);
    return strip<Holding>(item);
  }

  async getCash(userId: string): Promise<BrokerCash[]> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND begins_with(SK, :p)', {
      values: { ':pk': Keys.user(userId), ':p': 'CASH#' },
    });
    return items.map((i) => ({ brokerId: String(i.SK).slice('CASH#'.length), balanceCents: Number(i.balanceCents ?? 0) }));
  }

  /** Writes a rebuilt holding, guarded by the version that was read (absent when it did not exist). */
  holdingPutItem(userId: string, holding: Holding, expectedVersion: number): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: { PK: Keys.user(userId), SK: Keys.holding(holding.brokerId, holding.ticker), ...holding },
        ConditionExpression: '#v = :v',
        ExpressionAttributeNames: { '#v': 'version' },
        ExpressionAttributeValues: { ':v': expectedVersion },
      },
    };
  }

  /** Writes a rebuilt holding, guarded by the version that was read (absent when it did not exist). */
  async putHolding(userId: string, holding: Holding, expectedVersion: number | null): Promise<void> {
    const item = { PK: Keys.user(userId), SK: Keys.holding(holding.brokerId, holding.ticker), ...holding };
    if (expectedVersion === null) {
      await this.store.put(this.table, item, { condition: 'attribute_not_exists(PK)' });
    } else {
      await this.store.put(this.table, item, {
        condition: '#v = :v',
        names: { '#v': 'version' },
        values: { ':v': expectedVersion },
      });
    }
  }

  holdingBuyItem(userId: string, holding: Pick<Holding, 'brokerId' | 'ticker' | 'assetClass' | 'name'>, quantityMicro: number, costCents: number): TransactItem {
    return addUpdate(
      this.table,
      Keys.user(userId),
      Keys.holding(holding.brokerId, holding.ticker),
      { quantityMicro, costBasisCents: costCents, version: 1, realizedGainCents: 0 },
      { brokerId: holding.brokerId, ticker: holding.ticker, assetClass: holding.assetClass, name: holding.name ?? null },
    );
  }

  holdingSellItem(userId: string, holding: Holding, soldMicro: number, costRemovedCents: number, realizedGainCents: number): TransactItem {
    return addUpdate(
      this.table,
      Keys.user(userId),
      Keys.holding(holding.brokerId, holding.ticker),
      { quantityMicro: -soldMicro, costBasisCents: -costRemovedCents, realizedGainCents, version: 1 },
      {},
      {
        expression: '#cv = :cv AND #cq >= :sold',
        names: { '#cv': 'version', '#cq': 'quantityMicro' },
        values: { ':cv': holding.version, ':sold': soldMicro },
      },
    );
  }

  cashItem(userId: string, brokerId: string, deltaCents: number): TransactItem {
    return addUpdate(this.table, Keys.user(userId), Keys.cash(brokerId), { balanceCents: deltaCents });
  }

  investmentMonthItem(userId: string, month: string, add: Record<string, number>): TransactItem {
    return addUpdate(this.table, Keys.user(userId), Keys.month(month, 'INV'), add);
  }

  // ---------- Shared FX and prices ----------

  async getFxRate(date: string): Promise<FxRate | undefined> {
    const item = await this.store.get(this.table, { PK: Keys.fx(date), SK: GLOBAL_SK });
    return strip<FxRate>(item);
  }

  async putFxRate(rate: FxRate): Promise<void> {
    await this.store.put(this.table, { PK: Keys.fx(rate.date), SK: GLOBAL_SK, ...rate });
  }

  async getPrices(tickers: string[]): Promise<Price[]> {
    if (tickers.length === 0) return [];
    const items = await this.store.batchGet(
      this.table,
      tickers.map((t) => ({ PK: Keys.price(t), SK: GLOBAL_SK })),
    );
    return items.map((i) => strip<Price>(i)!);
  }

  async putPrice(price: Price): Promise<void> {
    await this.store.put(this.table, { PK: Keys.price(price.ticker), SK: GLOBAL_SK, ...price });
  }

  /** A failed refresh updates only `lastError` and `lastAttemptAt`; the last known price stays. */
  async putPriceError(ticker: string, code: string, at: string, ttl: number): Promise<void> {
    await this.store.update(
      this.table,
      { PK: Keys.price(ticker), SK: GLOBAL_SK },
      {
        update: 'SET lastError = :e, lastAttemptAt = :a, ticker = :t, #ttl = if_not_exists(#ttl, :ttl)',
        names: { '#ttl': 'ttl' },
        values: { ':e': code, ':a': at, ':t': ticker, ':ttl': ttl },
      },
    );
  }
}
