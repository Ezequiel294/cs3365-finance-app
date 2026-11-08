import type { Account, Broker, Budget, Category, Rule, Scope, Tag, UserSettings } from "@finance/shared";
import { ConflictError } from "../http/errors";
import { Keys } from "../keys";
import { DynamoStore, isConditionFailure, stripKeys, type Item } from "./dynamo-store";

export const DEFAULT_SETTINGS: Omit<UserSettings, "userId"> = {
  timeZone: "America/Costa_Rica",
  weekStart: "MONDAY",
  baseCurrency: "USD",
};

/** Reference table: profile, accounts, categories, tags, rules, budgets, brokers. Global items use `PK = GLOBAL`. */
export class ReferenceRepository {
  constructor(
    private readonly store: DynamoStore,
    private readonly table: string,
  ) {}

  // ---------- Profile ----------

  async getSettings(userId: string): Promise<UserSettings> {
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.PROFILE });
    return {
      userId,
      timeZone: String(item?.timeZone ?? DEFAULT_SETTINGS.timeZone),
      weekStart: (item?.weekStart as UserSettings["weekStart"]) ?? DEFAULT_SETTINGS.weekStart,
      baseCurrency: "USD",
    };
  }

  async putSettings(settings: UserSettings): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(settings.userId), SK: Keys.PROFILE, ...settings });
  }

  // ---------- Accounts ----------

  async getAccount(userId: string, id: string): Promise<Account | undefined> {
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.account(id) });
    return item ? stripKeys<Account>(item) : undefined;
  }

  async listAccounts(userId: string): Promise<Account[]> {
    const items = await this.store.query(this.table, { pk: Keys.user(userId), beginsWith: "ACCOUNT#" });
    return items.map((i) => stripKeys<Account>(i));
  }

  async putAccount(userId: string, account: Account): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.account(account.id), ...account }, { expression: "attribute_not_exists(PK)" });
  }

  // ---------- Categories and tags ----------

  async getCategories(userId: string, ids: string[]): Promise<Category[]> {
    return this.getLabels<Category>(userId, ids, Keys.category);
  }

  async getTags(userId: string, ids: string[]): Promise<Tag[]> {
    return this.getLabels<Tag>(userId, ids, Keys.tag);
  }

  async listCategories(userId: string): Promise<Category[]> {
    return this.listLabels<Category>(userId, "CAT#");
  }

  async listTags(userId: string): Promise<Tag[]> {
    return this.listLabels<Tag>(userId, "TAG#");
  }

  async putCategory(userId: string, category: Category): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.category(category.id), ...category }, { expression: "attribute_not_exists(PK)" });
  }

  async putTag(userId: string, tag: Tag): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.tag(tag.id), ...tag }, { expression: "attribute_not_exists(PK)" });
  }

  private async getLabels<T extends Category | Tag>(userId: string, ids: string[], sk: (id: string) => string): Promise<T[]> {
    if (ids.length === 0) return [];
    const keys = ids.flatMap((id) => [
      { PK: Keys.GLOBAL, SK: sk(id) },
      { PK: Keys.user(userId), SK: sk(id) },
    ]);
    const items = await this.store.batchGet(this.table, keys);
    return items.map((i) => toLabel<T>(i));
  }

  private async listLabels<T extends Category | Tag>(userId: string, prefix: string): Promise<T[]> {
    const [globalItems, userItems] = await Promise.all([
      this.store.query(this.table, { pk: Keys.GLOBAL, beginsWith: prefix }),
      this.store.query(this.table, { pk: Keys.user(userId), beginsWith: prefix }),
    ]);
    return [...globalItems, ...userItems].map((i) => toLabel<T>(i));
  }

  // ---------- Rules ----------

  /** `scope` is `GLOBAL` or a user ID. */
  async getRule(scope: string, merchantKey: string): Promise<Rule | undefined> {
    const pk = scope === Keys.GLOBAL ? Keys.GLOBAL : Keys.user(scope);
    const item = await this.store.get(this.table, { PK: pk, SK: Keys.rule(merchantKey) });
    if (!item) return undefined;
    return {
      merchantKey,
      categoryId: String(item.categoryId),
      tagIds: (item.tagIds as string[]) ?? [],
      scope: scope === Keys.GLOBAL ? "GLOBAL" : "USER",
    };
  }

  async putRule(userId: string, rule: Rule): Promise<void> {
    await this.store.put(this.table, {
      PK: Keys.user(userId),
      SK: Keys.rule(rule.merchantKey),
      merchantKey: rule.merchantKey,
      categoryId: rule.categoryId,
      tagIds: rule.tagIds,
    });
  }

  // ---------- Budgets ----------

  async listBudgets(userId: string): Promise<Budget[]> {
    const items = await this.store.query(this.table, { pk: Keys.user(userId), beginsWith: "BUDGET#" });
    return items.map((i) => toBudget(i));
  }

  async getBudget(userId: string, id: string): Promise<Budget | undefined> {
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.budget(id) });
    return item ? toBudget(item) : undefined;
  }

  async putBudget(userId: string, budget: Budget): Promise<void> {
    await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.budget(budget.id), ...clean(budget) }, { expression: "attribute_not_exists(PK)" });
  }

  /** Writes `budget` (whose version is already incremented) only if the stored version is `expectedVersion`. */
  async updateBudget(userId: string, budget: Budget, expectedVersion: number): Promise<void> {
    try {
      await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.budget(budget.id), ...clean(budget) }, {
        expression: "#v = :expected",
        names: { "#v": "version" },
        values: { ":expected": expectedVersion },
      });
    } catch (error) {
      if (isConditionFailure(error)) throw new ConflictError("The budget changed meanwhile; reload it and try again");
      throw error;
    }
  }

  // ---------- Brokers ----------

  async getBroker(userId: string, id: string): Promise<Broker | undefined> {
    const item = await this.store.get(this.table, { PK: Keys.user(userId), SK: Keys.broker(id) });
    return item ? toBroker(item) : undefined;
  }

  async listBrokers(userId: string): Promise<Broker[]> {
    const items = await this.store.query(this.table, { pk: Keys.user(userId), beginsWith: "BROKER#" });
    return items.map(toBroker);
  }

  /** Creates (expectedVersion 0) or updates a broker, guarded by version. */
  async updateBroker(userId: string, broker: Broker, expectedVersion: number): Promise<void> {
    const condition =
      expectedVersion === 0
        ? { expression: "attribute_not_exists(PK)" }
        : { expression: "#v = :expected", names: { "#v": "version" }, values: { ":expected": expectedVersion } };
    try {
      await this.store.put(this.table, { PK: Keys.user(userId), SK: Keys.broker(broker.id), ...broker }, condition);
    } catch (error) {
      if (isConditionFailure(error)) throw new ConflictError("The broker changed meanwhile; reload it and try again");
      throw error;
    }
  }
}

function toLabel<T extends Category | Tag>(item: Item): T {
  const scope: Scope = item.PK === Keys.GLOBAL ? "GLOBAL" : "USER";
  return { id: String(item.id), name: String(item.name), scope, archived: Boolean(item.archived) } as T;
}

function toBudget(item: Item): Budget {
  const b = stripKeys<Budget>(item);
  return { ...b, categoryIds: b.categoryIds ?? [], tagIds: b.tagIds ?? [] };
}

function toBroker(item: Item): Broker {
  return {
    id: String(item.id),
    name: String(item.name),
    flatCents: Number(item.flatCents ?? 0),
    percentBps: Number(item.percentBps ?? 0),
    version: Number(item.version ?? 1),
  };
}

function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
