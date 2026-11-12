import type { InvestmentTransaction } from '../../../shared/types';
import { Keys, dateFromId } from '../keys';
import { DynamoStore, type Item, type TransactItem, stripKeys } from './dynamo-store';

export const TICKER_INDEX = 'ticker';

/** InvestmentTx table: INV#<date>#<id>, with the `ticker` GSI (USER#<id>#<ticker>). */
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

  async get(userId: string, id: string): Promise<InvestmentTransaction | null> {
    const date = dateFromId(id);
    if (!date) return null;
    return stripKeys<InvestmentTransaction>(
      await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.inv(date, id) }, true),
    );
  }

  async list(userId: string): Promise<InvestmentTransaction[]> {
    const items = await this.store.query(
      this.table,
      { expression: 'PK = :pk AND begins_with(SK, :p)', values: { ':pk': Keys.user(userId), ':p': 'INV#' } },
      { scanForward: false },
    );
    return items.map((i) => stripKeys<InvestmentTransaction>(i)!);
  }

  /** Every trade of a ticker, in date order (ticker GSI). */
  async listByTicker(userId: string, ticker: string): Promise<InvestmentTransaction[]> {
    const items = await this.store.query(
      this.table,
      { expression: 'tickerPK = :t', values: { ':t': Keys.tickerIndex(userId, ticker) } },
      { indexName: TICKER_INDEX, scanForward: true },
    );
    return items.map((i) => stripKeys<InvestmentTransaction>(i)!);
  }

  putItem(tx: InvestmentTransaction): TransactItem {
    return {
      Put: { TableName: this.table, Item: this.toItem(tx), ConditionExpression: 'attribute_not_exists(PK)' },
    };
  }

  updateItem(tx: InvestmentTransaction, expectedVersion: number): TransactItem {
    return {
      Put: {
        TableName: this.table,
        Item: this.toItem(tx),
        ConditionExpression: '#v = :v',
        ExpressionAttributeNames: { '#v': 'version' },
        ExpressionAttributeValues: { ':v': expectedVersion },
      },
    };
  }

  async update(tx: InvestmentTransaction, expectedVersion: number): Promise<void> {
    await this.store.transactWrite([this.updateItem(tx, expectedVersion)]);
  }
}
