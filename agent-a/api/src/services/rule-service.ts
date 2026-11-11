import type { Rule, TransactionKind } from '@finance/shared';
import { ValidationError } from '../errors';
import type { ReferenceRepository } from '../repositories/reference-repository';

/** Saves a user rule for a merchant (02-S05). It applies to transactions that arrive from then on. */
export class RuleService {
  constructor(private readonly reference: ReferenceRepository) {}

  async upsert(
    userId: string,
    merchantKey: string,
    categoryId: string | null | undefined,
    tagIds: string[],
    kind?: TransactionKind | null,
  ): Promise<Rule> {
    if (!/^[a-z0-9-]{1,80}$/.test(merchantKey)) throw new ValidationError('Invalid merchant key');
    if (!categoryId && tagIds.length === 0 && !kind) throw new ValidationError('A rule needs a category, tags, or a kind');
    if (categoryId) {
      const cats = (await this.reference.getCategories(userId, [categoryId])).filter((c) => !c.archived);
      if (cats.length === 0) throw new ValidationError('Invalid category');
    }
    const unique = [...new Set(tagIds)];
    if (unique.length > 0) {
      const found = new Set((await this.reference.getTags(userId, unique)).filter((t) => !t.archived).map((t) => t.id));
      if (unique.some((t) => !found.has(t))) throw new ValidationError('Invalid tag');
    }
    const rule: Rule = { merchantKey, categoryId: categoryId ?? null, tagIds: unique, kind: kind ?? null, scope: 'USER' };
    await this.reference.putRule(userId, rule);
    return rule;
  }
}
