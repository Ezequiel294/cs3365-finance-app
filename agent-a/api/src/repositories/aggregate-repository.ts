import type {
  BrokerCash,
  BudgetDayTotal,
  BudgetPeriodTotal,
  FxRate,
  Holding,
  InvestmentMonthRollup,
  Price,
  PriceErrorCode,
  SpendingRollup,
} from '../../../shared/types';
import type { RollupDelta } from '../core/rollup-planner';
import { Keys } from '../keys';
import { DynamoStore, type Item, type TransactItem } from './dynamo-store';

export interface InvestmentMonthDelta {
  month: string;
  depositedCents?: number;
  withdrawnCents?: number;
  boughtCents?: number;
  soldCents?: number;
  commissionsCents?: number;
  realizedGainCents?: number;
}

const INV_FIELDS = [
  'depositedCents',
  'withdrawnCents',
  'boughtCents',
  'soldCents',
  'commissionsCents',
  'realizedGainCents',
] as const;

/** Aggregates table: rollups, budget totals, holdings, broker cash, FX and price caches. */
export class AggregateRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  private toRollup(item: Item): SpendingRollup {
    const sk: string = item.SK;
    const parts = sk.split('#');
    // MONTH#2026-10#TOTAL | MONTH#2026-10#CAT#id | DAY#2026-10-14#TOTAL
    const dimension = (parts[2] ?? 'TOTAL') as SpendingRollup['dimension'];
    return {
      bucket: `${parts[0]}#${parts[1]}`,
      dimension,
      dimensionId: dimension === 'TOTAL' ? 'TOTAL' : parts.slice(3).join('#'),
      expenseCents: item.expenseCents ?? 0,
      incomeCents: item.incomeCents ?? 0,
      count: item.count ?? 0,
    };
  }

  async getMonth(userId: string, month: string, dimension: 'CAT' | 'TAG'): Promise<SpendingRollup[]> {
    const items = await this.store.query(this.table, {
      expression: 'PK = :pk AND begins_with(SK, :p)',
      values: { ':pk': Keys.user(userId), ':p': `MONTH#${month}#${dimension}#` },
    });
    return items.map((i) => this.toRollup(i));
  }

  async getMonths(userId: string, months: string[]): Promise<SpendingRollup[]> {
    const items = await this.store.batchGet(
      this.table,
      months.map((m) => ({ PK: Keys.user(userId), SK: Keys.month(m, 'TOTAL') })),
    );
    return items.map((i) => this.toRollup(i));
  }

  async getInvestmentMonths(userId: string, months: string[]): Promise<InvestmentMonthRollup[]> {
    const items = await this.store.batchGet(
      this.table,
      months.map((m) => ({ PK: Keys.user(userId), SK: Keys.month(m, 'INV') })),
    );
    return items.map((i) => ({
      month: String(i.SK).split('#')[1]!,
      depositedCents: i.depositedCents ?? 0,
      withdrawnCents: i.withdrawnCents ?? 0,
      boughtCents: i.boughtCents ?? 0,
      soldCents: i.soldCents ?? 0,
      commissionsCents: i.commissionsCents ?? 0,
      realizedGainCents: i.realizedGainCents ?? 0,
    }));
  }

  async getBudgetPeriods(
    userId: string,
    keys: Array<{ budgetId: string; periodStart: string }>,
  ): Promise<BudgetPeriodTotal[]> {
    const items = await this.store.batchGet(
      this.table,
      keys.map((k) => ({ PK: Keys.user(userId), SK: Keys.budgetPeriod(k.budgetId, k.periodStart) })),
    );
    return items.map((i) => {
      const parts = String(i.SK).split('#'); // BUDGET#id#P#date
      return {
        budgetId: parts[1]!,
        periodStart: parts[3]!,
        spentCents: i.spentCents ?? 0,
        count: i.count ?? 0,
        limitCents: i.limitCents ?? 0,
      };
    });
  }

  async getBudgetDays(userId: string, budgetId: string, from: string, to: string): Promise<BudgetDayTotal[]> {
    const items = await this.store.query(this.table, {
      expression: 'PK = :pk AND SK BETWEEN :a AND :b',
      values: {
        ':pk': Keys.user(userId),
        ':a': Keys.budgetDay(budgetId, from),
        ':b': Keys.budgetDay(budgetId, to),
      },
    });
    return items.map((i) => ({
      budgetId,
      date: String(i.SK).split('#')[3]!,
      spentCents: i.spentCents ?? 0,
    }));
  }

  /** Delete every P# and D# item of the budget, then write the rebuilt ones. */
  async replaceBudgetItems(
    userId: string,
    budgetId: string,
    periods: BudgetPeriodTotal[],
    days: BudgetDayTotal[],
  ): Promise<void> {
    const existing = await this.store.query(this.table, {
      expression: 'PK = :pk AND begins_with(SK, :p)',
      values: { ':pk': Keys.user(userId), ':p': Keys.budgetPrefix(budgetId) },
    });
    await this.store.batchWrite(
      this.table,
      [],
      existing.map((i) => ({ PK: i.PK, SK: i.SK })),
    );
    await this.store.batchWrite(this.table, [
      ...periods.map((p) => ({
        PK: Keys.user(userId),
        SK: Keys.budgetPeriod(budgetId, p.periodStart),
        spentCents: p.spentCents,
        count: p.count,
        limitCents: p.limitCents,
      })),
      ...days.map((d) => ({
        PK: Keys.user(userId),
        SK: Keys.budgetDay(budgetId, d.date),
        spentCents: d.spentCents,
      })),
    ]);
  }

  async deleteBudgetItems(userId: string, budgetId: string): Promise<void> {
    await this.replaceBudgetItems(userId, budgetId, [], []);
  }

  /** One ADD update per delta. Budget keys store the expense delta as spentCents. */
  addItems(userId: string, deltas: RollupDelta[]): TransactItem[] {
    return deltas.map((d) => {
      const isBudget = d.key.startsWith('BUDGET#');
      const isBudgetDay = isBudget && d.key.includes('#D#');
      if (isBudget) {
        const names: Record<string, string> = { '#s': 'spentCents' };
        const values: Record<string, unknown> = { ':s': d.expenseCents };
        let update = 'ADD #s :s';
        if (!isBudgetDay) {
          names['#c'] = 'count';
          values[':c'] = d.count;
          update += ', #c :c';
          if (d.limitCents !== undefined) {
            names['#l'] = 'limitCents';
            values[':l'] = d.limitCents;
            update += ' SET #l = :l';
          }
        }
        return {
          Update: {
            TableName: this.table,
            Key: { PK: Keys.user(userId), SK: d.key },
            UpdateExpression: update,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
          },
        };
      }
      return {
        Update: {
          TableName: this.table,
          Key: { PK: Keys.user(userId), SK: d.key },
          UpdateExpression: 'ADD #e :e, #i :i, #c :c',
          ExpressionAttributeNames: { '#e': 'expenseCents', '#i': 'incomeCents', '#c': 'count' },
          ExpressionAttributeValues: { ':e': d.expenseCents, ':i': d.incomeCents, ':c': d.count },
        },
      };
    });
  }

  // ---------- Investments ----------

  async getHolding(userId: string, brokerId: string, ticker: string): Promise<Holding | null> {
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.holding(brokerId, ticker) }, true);
    return item ? toHolding(item) : null;
  }

  async getHoldings(userId: string): Promise<Holding[]> {
    const items = await this.store.query(this.table, {
      expression: 'PK = :pk AND begins_with(SK, :p)',
      values: { ':pk': Keys.user(userId), ':p': 'HOLDING#' },
    });
    return items.map(toHolding);
  }

  async getCash(userId: string): Promise<BrokerCash[]> {
    const items = await this.store.query(this.table, {
      expression: 'PK = :pk AND begins_with(SK, :p)',
      values: { ':pk': Keys.user(userId), ':p': 'CASH#' },
    });
    return items.map((i) => ({ brokerId: String(i.SK).slice('CASH#'.length), balanceCents: i.balanceCents ?? 0 }));
  }

  /** Conditional put of a holding: its version must still be `expectedVersion` (0 = new). */
  putHoldingItem(userId: string, holding: Holding, expectedVersion: number): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: { PK: Keys.user(userId), SK: Keys.holding(holding.brokerId, holding.ticker), ...holding },
        ConditionExpression:
          expectedVersion === 0 ? 'attribute_not_exists(PK)' : '#v = :v',
        ExpressionAttributeNames: expectedVersion === 0 ? undefined : { '#v': 'version' },
        ExpressionAttributeValues: expectedVersion === 0 ? undefined : { ':v': expectedVersion },
      },
    };
  }

  async putHolding(userId: string, holding: Holding, expectedVersion: number): Promise<void> {
    await this.store.transactWrite([this.putHoldingItem(userId, holding, expectedVersion)]);
  }

  cashItem(userId: string, brokerId: string, deltaCents: number): TransactItem {
    return {
      Update: {
        TableName: this.table,
        Key: { PK: Keys.user(userId), SK: Keys.cash(brokerId) },
        UpdateExpression: 'ADD #b :b',
        ExpressionAttributeNames: { '#b': 'balanceCents' },
        ExpressionAttributeValues: { ':b': deltaCents },
      },
    };
  }

  investmentMonthItem(userId: string, delta: InvestmentMonthDelta): TransactItem {
    const names: Record<string, string> = {};
    const values: Record<string, number> = {};
    const adds: string[] = [];
    INV_FIELDS.forEach((f, i) => {
      names[`#f${i}`] = f;
      values[`:v${i}`] = delta[f] ?? 0;
      adds.push(`#f${i} :v${i}`);
    });
    return {
      Update: {
        TableName: this.table,
        Key: { PK: Keys.user(userId), SK: Keys.month(delta.month, 'INV') },
        UpdateExpression: `ADD ${adds.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    };
  }

  // ---------- FX cache ----------

  async getFxRate(date: string): Promise<FxRate | null> {
    const item = await this.store.get(this.table, { PK: Keys.fx(date), SK: Keys.FX_SK });
    if (!item) return null;
    return { date, rate: Number(item.rate), rateDate: item.rateDate, source: item.source };
  }

  async putFxRate(rate: FxRate): Promise<void> {
    await this.store.put(this.table, {
      PK: Keys.fx(rate.date),
      SK: Keys.FX_SK,
      date: rate.date,
      rate: rate.rate,
      rateDate: rate.rateDate,
      source: rate.source,
    });
  }

  // ---------- Price cache ----------

  async getPrices(tickers: string[]): Promise<Price[]> {
    if (!tickers.length) return [];
    const items = await this.store.batchGet(
      this.table,
      tickers.map((t) => ({ PK: Keys.price(t), SK: Keys.PRICE_SK })),
    );
    return items.map((i) => {
      const { PK, SK, ...rest } = i;
      void PK;
      void SK;
      return rest as Price;
    });
  }

  async putPrice(price: Price): Promise<void> {
    await this.store.put(this.table, { PK: Keys.price(price.ticker), SK: Keys.PRICE_SK, ...price });
  }

  /** A failed refresh only records the error and when it was tried; the last price stays. */
  async recordPriceError(ticker: string, code: PriceErrorCode, at: string, nativeCurrency: string | null = null): Promise<void> {
    await this.store.update(
      this.table,
      { PK: Keys.price(ticker), SK: Keys.PRICE_SK },
      {
        update: nativeCurrency
          ? 'SET #t = :t, lastError = :e, lastAttemptAt = :a, nativeCurrency = :c'
          : 'SET #t = :t, lastError = :e, lastAttemptAt = :a',
        names: { '#t': 'ticker' },
        values: nativeCurrency ? { ':t': ticker, ':e': code, ':a': at, ':c': nativeCurrency } : { ':t': ticker, ':e': code, ':a': at },
      },
    );
  }
}

function toHolding(i: Item): Holding {
  return {
    brokerId: i.brokerId,
    ticker: i.ticker,
    assetClass: i.assetClass,
    name: i.name ?? null,
    quantityMicro: i.quantityMicro ?? 0,
    costBasisCents: i.costBasisCents ?? 0,
    realizedGainCents: i.realizedGainCents ?? 0,
    version: i.version ?? 0,
  };
}
