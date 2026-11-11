import type { InvestmentTransaction } from '@finance/shared';
import { dateFromDatedId, Keys } from '../keys';
import { DynamoStore, strip, type Item, type TransactItem } from './dynamo-store';

export const TICKER_INDEX = 'ticker';

export class InvestmentTxRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  private toItem(tx: InvestmentTransaction): Item {
    const item: Item = { PK: Keys.user(tx.userId), SK: Keys.inv(tx.localDate, tx.id), ...tx };
    if (tx.ticker) item.tickerPK = Keys.tickerIndex(tx.userId, tx.ticker);
    return item;
  }

  async get(userId: string, id: string): Promise<InvestmentTransaction | undefined> {
    const date = dateFromDatedId(id);
    if (!date) return undefined;
    return strip<InvestmentTransaction>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.inv(date, id) }, true));
  }

  async list(userId: string): Promise<InvestmentTransaction[]> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND begins_with(SK, :p)', {
      values: { ':pk': Keys.user(userId), ':p': 'INV#' },
      scanForward: false,
    });
    return items.map((i) => strip<InvestmentTransaction>(i)!);
  }

  /** Every trade of a ticker, in date order (ticker GSI). */
  async listByTicker(userId: string, ticker: string): Promise<InvestmentTransaction[]> {
    const items = await this.store.queryAll(this.table, 'tickerPK = :t', {
      indexName: TICKER_INDEX,
      values: { ':t': Keys.tickerIndex(userId, ticker) },
      scanForward: true,
    });
    return items.map((i) => strip<InvestmentTransaction>(i)!);
  }

  putItem(tx: InvestmentTransaction): TransactItem {
    return { Put: { TableName: this.table, Item: this.toItem(tx), ConditionExpression: 'attribute_not_exists(PK)' } };
  }

  updateItem(tx: InvestmentTransaction, expectedVersion: number): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: this.toItem(tx),
        ConditionExpression: 'attribute_exists(PK) AND #v = :v',
        ExpressionAttributeNames: { '#v': 'version' },
        ExpressionAttributeValues: { ':v': expectedVersion },
      },
    };
  }

  /** Throws `ConditionFailedError` when the stored version is not `expectedVersion`. */
  async update(tx: InvestmentTransaction, expectedVersion: number): Promise<void> {
    await this.store.put(this.table, this.toItem(tx), {
      condition: 'attribute_exists(PK) AND #v = :v',
      names: { '#v': 'version' },
      values: { ':v': expectedVersion },
    });
  }
}
