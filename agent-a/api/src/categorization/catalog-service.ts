import type { Catalog } from '../../../shared/api-types';
import type { Category, Tag } from '../../../shared/types';
import { ConflictError } from '../http/errors';
import { randomId } from '../ids';
import type { ReferenceRepository } from '../repositories/reference-repository';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** The one source for every category select and tag picker (02-S02a). */
export class CatalogService {
  constructor(private readonly reference: ReferenceRepository) {}

  async list(userId: string): Promise<Catalog> {
    const [categories, tags] = await Promise.all([
      this.reference.listCategories(userId),
      this.reference.listTags(userId),
    ]);
    const global = categories.filter((c) => c.scope === 'global').sort(byName);
    const own = categories.filter((c) => c.scope !== 'global').sort(byName);
    return { categories: [...global, ...own], tags: [...tags].sort(byName) };
  }

  async createCategory(userId: string, name: string): Promise<Category> {
    const existing = await this.reference.listCategories(userId);
    this.assertNameFree(existing, name, `You already have a category called ${name.trim()}.`);
    const category: Category = { id: `c-${randomId(10)}`, name: name.trim(), scope: 'user', archived: false };
    await this.reference.putCategory(userId, category);
    return category;
  }

  async createTag(userId: string, name: string): Promise<Tag> {
    const existing = await this.reference.listTags(userId);
    this.assertNameFree(existing, name, `You already have a tag called ${name.trim()}.`);
    const tag: Tag = { id: `t-${randomId(10)}`, name: name.trim(), scope: 'user', archived: false };
    await this.reference.putTag(userId, tag);
    return tag;
  }

  private assertNameFree(existing: Array<{ name: string }>, name: string, message: string): void {
    const wanted = name.trim().toLocaleLowerCase();
    if (existing.some((e) => e.name.trim().toLocaleLowerCase() === wanted)) {
      throw new ConflictError(message, 'NAME_TAKEN', undefined, { name: message });
    }
  }
}
