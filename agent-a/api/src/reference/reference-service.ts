import type { Account, Category, NewAccount, NewLabel, ReferenceData, SettingsInput, Tag, UserSettings } from "@finance/shared";
import { ConflictError } from "../http/errors";
import { randomId } from "../ids";
import type { ReferenceRepository } from "../repositories/reference-repository";

/**
 * Supporting setup the in-scope stories depend on: accounts to record against, the user's own
 * categories and tags next to the global ones, and the profile (time zone, week start).
 * Account balances are not tracked (01-S06 is out of scope).
 */
export class ReferenceService {
  constructor(private readonly reference: ReferenceRepository) {}

  async list(userId: string): Promise<ReferenceData> {
    const [accounts, categories, tags] = await Promise.all([
      this.reference.listAccounts(userId),
      this.reference.listCategories(userId),
      this.reference.listTags(userId),
    ]);
    const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
    return {
      accounts: accounts.sort(byName),
      categories: categories.filter((c) => !c.archived).sort(byName),
      tags: tags.filter((t) => !t.archived).sort(byName),
    };
  }

  async createAccount(userId: string, input: NewAccount): Promise<Account> {
    const accounts = await this.reference.listAccounts(userId);
    if (input.last4 && accounts.some((a) => a.last4 === input.last4)) {
      throw new ConflictError("Another account already ends in those 4 digits", "DUPLICATE_LAST4");
    }
    const account: Account = { id: `acc-${randomId(10)}`, ...input };
    await this.reference.putAccount(userId, account);
    return account;
  }

  async createCategory(userId: string, input: NewLabel): Promise<Category> {
    const category: Category = { id: `${slug(input.name)}-${randomId(4)}`, name: input.name, scope: "USER", archived: false };
    await this.reference.putCategory(userId, category);
    return category;
  }

  async createTag(userId: string, input: NewLabel): Promise<Tag> {
    const tag: Tag = { id: `${slug(input.name)}-${randomId(4)}`, name: input.name, scope: "USER", archived: false };
    await this.reference.putTag(userId, tag);
    return tag;
  }

  getSettings(userId: string): Promise<UserSettings> {
    return this.reference.getSettings(userId);
  }

  async putSettings(userId: string, input: SettingsInput): Promise<UserSettings> {
    const settings: UserSettings = { userId, timeZone: input.timeZone, weekStart: input.weekStart, baseCurrency: "USD" };
    await this.reference.putSettings(settings);
    return settings;
  }
}

function slug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30) || "label"
  );
}
