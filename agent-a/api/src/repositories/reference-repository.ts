import {
  DEFAULT_TIME_ZONE,
  type Account,
  type Broker,
  type Budget,
  type Category,
  type Rule,
  type Tag,
  type UserSettings,
} from '@finance/shared';
import { GLOBAL_PK, Keys } from '../keys';
import { DynamoStore, strip, type Item } from './dynamo-store';

const versionCondition = (expected: number) => ({
  condition: 'attribute_exists(PK) AND #v = :expected',
  names: { '#v': 'version' },
  values: { ':expected': expected },
});

export class ReferenceRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  private async listPrefix<T>(pk: string, prefix: string): Promise<T[]> {
    const items = await this.store.queryAll(this.table, 'PK = :pk AND begins_with(SK, :p)', {
      values: { ':pk': pk, ':p': prefix },
    });
    return items.map((i) => strip<T>(i)!);
  }

  // ---------- Settings ----------

  async getSettings(userId: string): Promise<UserSettings> {
    const item = strip<UserSettings>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.profile() }));
    return {
      userId,
      timeZone: item?.timeZone ?? DEFAULT_TIME_ZONE,
      weekStart: item?.weekStart ?? 'MONDAY',
      baseCurrency: 'USD',
    };
  }

  async putSettings(settings: UserSettings): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(settings.userId), SK: Keys.profile(), ...settings });
  }

  // ---------- Accounts ----------

  async getAccount(userId: string, id: string): Promise<Account | undefined> {
    return strip<Account>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.account(id) }));
  }

  async listAccounts(userId: string): Promise<Account[]> {
    return this.listPrefix<Account>(Keys.user(userId), 'ACCOUNT#');
  }

  /** The account whose `cardLast4s` contains `last4`. A user has few accounts, so no index is needed. */
  async findAccountByCard(userId: string, last4: string): Promise<Account | undefined> {
    const accounts = await this.listAccounts(userId);
    return accounts.find((a) => (a.cardLast4s ?? []).includes(last4));
  }

  async putAccount(userId: string, account: Account): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.account(account.id), ...account },
      { condition: 'attribute_not_exists(PK)' },
    );
  }

  async updateAccount(userId: string, account: Account, expectedVersion: number): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.account(account.id), ...account },
      versionCondition(expectedVersion),
    );
  }

  // ---------- Categories and tags ----------

  private async getScoped<T extends { id: string }>(userId: string, ids: string[], key: (id: string) => string): Promise<T[]> {
    if (ids.length === 0) return [];
    const keys = ids.flatMap((id) => [
      { PK: Keys.user(userId), SK: key(id) },
      { PK: GLOBAL_PK, SK: key(id) },
    ]);
    const items = await this.store.batchGet(this.table, keys);
    return items.map((i: Item) => ({ ...strip<T>(i)!, scope: i.PK === GLOBAL_PK ? 'GLOBAL' : 'USER' }));
  }

  async getCategories(userId: string, ids: string[]): Promise<Category[]> {
    return this.getScoped<Category>(userId, ids, Keys.category);
  }

  async getTags(userId: string, ids: string[]): Promise<Tag[]> {
    return this.getScoped<Tag>(userId, ids, Keys.tag);
  }

  async listCategories(userId: string): Promise<Category[]> {
    const [global, own] = await Promise.all([
      this.listPrefix<Category>(GLOBAL_PK, 'CAT#'),
      this.listPrefix<Category>(Keys.user(userId), 'CAT#'),
    ]);
    return [...global.map((c) => ({ ...c, scope: 'GLOBAL' as const })), ...own.map((c) => ({ ...c, scope: 'USER' as const }))];
  }

  async listTags(userId: string): Promise<Tag[]> {
    const [global, own] = await Promise.all([
      this.listPrefix<Tag>(GLOBAL_PK, 'TAG#'),
      this.listPrefix<Tag>(Keys.user(userId), 'TAG#'),
    ]);
    return [...global.map((t) => ({ ...t, scope: 'GLOBAL' as const })), ...own.map((t) => ({ ...t, scope: 'USER' as const }))];
  }

  async putCategory(userId: string, category: Category): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.category(category.id), ...category });
  }

  async putTag(userId: string, tag: Tag): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.tag(tag.id), ...tag });
  }

  // ---------- Rules ----------

  /** `scope` is a userId, or `GLOBAL` for the shared rules. */
  async getRule(scope: string, merchantKey: string): Promise<Rule | undefined> {
    const pk = scope === GLOBAL_PK ? GLOBAL_PK : Keys.user(scope);
    const item = await this.store.get(this.table, { PK: pk, SK: Keys.rule(merchantKey) });
    if (!item) return undefined;
    return { ...strip<Rule>(item)!, scope: scope === GLOBAL_PK ? 'GLOBAL' : 'USER' };
  }

  async putRule(userId: string, rule: Rule): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.rule(rule.merchantKey), ...rule });
  }

  // ---------- Budgets ----------

  async listBudgets(userId: string): Promise<Budget[]> {
    return this.listPrefix<Budget>(Keys.user(userId), 'BUDGET#');
  }

  async getBudget(userId: string, id: string): Promise<Budget | undefined> {
    return strip<Budget>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.budget(id) }, true));
  }

  async putBudget(userId: string, budget: Budget): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.budget(budget.id), ...budget },
      { condition: 'attribute_not_exists(PK)' },
    );
  }

  async updateBudget(userId: string, budget: Budget, expectedVersion: number): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.budget(budget.id), ...budget }, versionCondition(expectedVersion));
  }

  // ---------- Brokers ----------

  async getBroker(userId: string, id: string): Promise<Broker | undefined> {
    return strip<Broker>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.broker(id) }));
  }

  async listBrokers(userId: string): Promise<Broker[]> {
    return this.listPrefix<Broker>(Keys.user(userId), 'BROKER#');
  }

  async putBroker(userId: string, broker: Broker): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.broker(broker.id), ...broker },
      { condition: 'attribute_not_exists(PK)' },
    );
  }

  async updateBroker(userId: string, broker: Broker, expectedVersion: number): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.broker(broker.id), ...broker }, versionCondition(expectedVersion));
  }
}
