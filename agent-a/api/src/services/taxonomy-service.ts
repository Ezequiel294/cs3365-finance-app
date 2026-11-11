import type { Category, Tag, UserSettings, WeekDay } from '@finance/shared';
import { ConflictError, ValidationError } from '../errors';
import type { ReferenceRepository } from '../repositories/reference-repository';

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/**
 * Lists categories and tags (global and the user's own), creates the user's own,
 * and reads/writes the user's settings. Supports 02-S02 and 03-S10; not a route of
 * the class diagram (see IMPLEMENTATION_NOTES).
 */
export class TaxonomyService {
  constructor(private readonly reference: ReferenceRepository) {}

  async listCategories(userId: string): Promise<Category[]> {
    return (await this.reference.listCategories(userId)).filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listTags(userId: string): Promise<Tag[]> {
    return (await this.reference.listTags(userId)).filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createCategory(userId: string, name: string): Promise<Category> {
    const existing = await this.reference.listCategories(userId);
    if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new ConflictError(`Category "${name}" already exists`);
    const category: Category = { id: `u-${slug(name) || 'cat'}-${crypto.randomUUID().slice(0, 8)}`, name, scope: 'USER', archived: false };
    await this.reference.putCategory(userId, category);
    return category;
  }

  async createTag(userId: string, name: string): Promise<Tag> {
    const existing = await this.reference.listTags(userId);
    if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) throw new ConflictError(`Tag "${name}" already exists`);
    const tag: Tag = { id: `u-${slug(name) || 'tag'}-${crypto.randomUUID().slice(0, 8)}`, name, scope: 'USER', archived: false };
    await this.reference.putTag(userId, tag);
    return tag;
  }

  async getSettings(userId: string): Promise<UserSettings> {
    return this.reference.getSettings(userId);
  }

  async updateSettings(userId: string, changes: { timeZone?: string; weekStart?: WeekDay }): Promise<UserSettings> {
    const current = await this.reference.getSettings(userId);
    if (changes.timeZone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: changes.timeZone });
      } catch {
        throw new ValidationError('Unknown time zone');
      }
    }
    const next: UserSettings = { ...current, ...changes, userId, baseCurrency: 'USD' };
    await this.reference.putSettings(next);
    return next;
  }
}
