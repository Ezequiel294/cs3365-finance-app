import type { Rule, TransactionKind } from '../../../shared/types';
import { ValidationError } from '../http/errors';
import type { ReferenceRepository } from '../repositories/reference-repository';

/** Rules are created from corrections (02-S05); there is no rule editor in this iteration. */
export class RuleService {
  constructor(private readonly reference: ReferenceRepository) {}

  async upsert(
    userId: string,
    merchantKey: string,
    categoryId: string | null,
    tagIds: string[],
    kind: TransactionKind | null,
  ): Promise<Rule> {
    if (!/^[a-z0-9-]{1,80}$/.test(merchantKey)) throw new ValidationError('Unknown merchant.');
    if (!categoryId && !kind && !tagIds.length) {
      throw new ValidationError('A rule needs a category, tags, or a type.');
    }
    if (categoryId) {
      const cats = await this.reference.getCategories(userId, [categoryId]);
      if (!cats.length) throw new ValidationError('Unknown category.', { categoryId: 'Unknown category' });
    }
    const uniqueTags = [...new Set(tagIds)];
    if (uniqueTags.length) {
      const tags = await this.reference.getTags(userId, uniqueTags);
      if (tags.length !== uniqueTags.length) throw new ValidationError('Unknown tag.', { tagIds: 'Unknown tag' });
    }
    const rule: Rule = { merchantKey, categoryId, tagIds: uniqueTags, kind, scope: 'user' };
    await this.reference.putRule(userId, rule);
    return rule;
  }
}
