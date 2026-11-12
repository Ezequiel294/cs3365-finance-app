import type {
  Account,
  Broker,
  Budget,
  Category,
  Rule,
  Tag,
  UserSettings,
} from '../../../shared/types';
import { GLOBAL_PK, Keys } from '../keys';
import { DynamoStore, type Item, stripKeys } from './dynamo-store';

/** Reference table: profile, accounts, catalog, rules, budgets, brokers (and GLOBAL items). */
export class ReferenceRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  private async listPrefix(pk: string, prefix: string): Promise<Item[]> {
    return this.store.query(this.table, {
      expression: 'PK = :pk AND begins_with(SK, :p)',
      values: { ':pk': pk, ':p': prefix },
    });
  }

  private versioned(expectedVersion: number) {
    return {
      expression: '#v = :v',
      names: { '#v': 'version' },
      values: { ':v': expectedVersion },
    };
  }

  // ---------- Settings ----------
  async getSettings(userId: string): Promise<UserSettings | null> {
    return stripKeys<UserSettings>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.profile() }));
  }
  async putSettings(userId: string, settings: UserSettings): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.profile(), ...settings });
  }

  // ---------- Accounts ----------
  async getAccount(userId: string, id: string): Promise<Account | null> {
    return stripKeys<Account>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.account(id) }, true));
  }
  async listAccounts(userId: string): Promise<Account[]> {
    const items = await this.listPrefix(Keys.user(userId), 'ACCOUNT#');
    return items.map((i) => stripKeys<Account>(i)!).sort((a, b) => a.name.localeCompare(b.name));
  }
  async findAccountByCard(userId: string, last4: string): Promise<Account | null> {
    const accounts = await this.listAccounts(userId);
    return accounts.find((a) => (a.cardLast4s ?? []).includes(last4)) ?? null;
  }
  async putAccount(userId: string, account: Account): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.account(account.id), ...account },
      { expression: 'attribute_not_exists(PK)' },
    );
  }
  async updateAccount(userId: string, account: Account, expectedVersion: number): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.account(account.id), ...account },
      this.versioned(expectedVersion),
    );
  }

  // ---------- Catalog ----------
  async getCategories(userId: string, ids: string[]): Promise<Category[]> {
    if (!ids.length) return [];
    const keys = ids.flatMap((id) => [
      { PK: GLOBAL_PK, SK: Keys.category(id) },
      { PK: Keys.user(userId), SK: Keys.category(id) },
    ]);
    const items = await this.store.batchGet(this.table, keys);
    return items.map((i) => stripKeys<Category>(i)!).filter((c) => !c.archived);
  }
  async getTags(userId: string, ids: string[]): Promise<Tag[]> {
    if (!ids.length) return [];
    const items = await this.store.batchGet(
      this.table,
      ids.map((id) => ({ PK: Keys.user(userId), SK: Keys.tag(id) })),
    );
    return items.map((i) => stripKeys<Tag>(i)!).filter((t) => !t.archived);
  }
  /** GLOBAL categories followed by the user's own, without archived ones. */
  async listCategories(userId: string): Promise<Category[]> {
    const [global, own] = await Promise.all([
      this.listPrefix(GLOBAL_PK, 'CAT#'),
      this.listPrefix(Keys.user(userId), 'CAT#'),
    ]);
    return [...global, ...own].map((i) => stripKeys<Category>(i)!).filter((c) => !c.archived);
  }
  async listTags(userId: string): Promise<Tag[]> {
    const items = await this.listPrefix(Keys.user(userId), 'TAG#');
    return items.map((i) => stripKeys<Tag>(i)!).filter((t) => !t.archived);
  }
  async putCategory(userId: string, category: Category): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.category(category.id), ...category },
      { expression: 'attribute_not_exists(PK)' },
    );
  }
  async putTag(userId: string, tag: Tag): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.tag(tag.id), ...tag },
      { expression: 'attribute_not_exists(PK)' },
    );
  }

  // ---------- Rules ----------
  /** scope is a userId for a user rule, or 'GLOBAL'. */
  async getRule(scope: string, merchantKey: string): Promise<Rule | null> {
    const pk = scope === GLOBAL_PK ? GLOBAL_PK : Keys.user(scope);
    return stripKeys<Rule>(await this.store.get(this.table, { PK: pk, SK: Keys.rule(merchantKey) }));
  }
  async putRule(userId: string, rule: Rule): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.rule(rule.merchantKey), ...rule });
  }

  // ---------- Budgets ----------
  async getBudget(userId: string, id: string): Promise<Budget | null> {
    return stripKeys<Budget>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.budget(id) }, true));
  }
  async listBudgets(userId: string): Promise<Budget[]> {
    const items = await this.listPrefix(Keys.user(userId), 'BUDGET#');
    return items.map((i) => stripKeys<Budget>(i)!);
  }
  async putBudget(userId: string, budget: Budget): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.budget(budget.id), ...budget },
      { expression: 'attribute_not_exists(PK)' },
    );
  }
  async updateBudget(userId: string, budget: Budget, expectedVersion: number): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.budget(budget.id), ...budget },
      this.versioned(expectedVersion),
    );
  }

  // ---------- Brokers ----------
  async getBroker(userId: string, id: string): Promise<Broker | null> {
    return stripKeys<Broker>(await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.broker(id) }, true));
  }
  async listBrokers(userId: string): Promise<Broker[]> {
    const items = await this.listPrefix(Keys.user(userId), 'BROKER#');
    return items.map((i) => stripKeys<Broker>(i)!).sort((a, b) => a.name.localeCompare(b.name));
  }
  async putBroker(userId: string, broker: Broker): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.broker(broker.id), ...broker },
      { expression: 'attribute_not_exists(PK)' },
    );
  }
  async updateBroker(userId: string, broker: Broker, expectedVersion: number): Promise<void> {
    await this.store.put(
      this.table,
      { PK: Keys.user(userId), SK: Keys.broker(broker.id), ...broker },
      this.versioned(expectedVersion),
    );
  }
}
