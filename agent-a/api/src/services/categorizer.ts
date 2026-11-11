import type { CategorizedBy, TransactionKind, TransactionStatus } from '@finance/shared';
import { GLOBAL_PK } from '../keys';
import type { ReferenceRepository } from '../repositories/reference-repository';

export interface Categorization {
  categoryId: string | null;
  tagIds: string[];
  kind?: TransactionKind | null;
  categorizedBy: CategorizedBy;
  status: TransactionStatus;
}

/** Deterministic rule lookup: the user's rule first, then the global rule, else the review inbox. */
export class Categorizer {
  constructor(private readonly reference: ReferenceRepository) {}

  async categorize(userId: string, merchantKey: string): Promise<Categorization> {
    const userRule = await this.reference.getRule(userId, merchantKey);
    if (userRule) {
      return {
        categoryId: userRule.categoryId ?? null,
        tagIds: userRule.tagIds ?? [],
        kind: userRule.kind ?? null,
        categorizedBy: 'rule',
        status: userRule.categoryId ? 'confirmed' : 'pending_review',
      };
    }
    const globalRule = await this.reference.getRule(GLOBAL_PK, merchantKey);
    if (globalRule) {
      return {
        categoryId: globalRule.categoryId ?? null,
        tagIds: globalRule.tagIds ?? [],
        kind: globalRule.kind ?? null,
        categorizedBy: 'global',
        status: globalRule.categoryId ? 'confirmed' : 'pending_review',
      };
    }
    return { categoryId: null, tagIds: [], kind: null, categorizedBy: 'none', status: 'pending_review' };
  }
}
