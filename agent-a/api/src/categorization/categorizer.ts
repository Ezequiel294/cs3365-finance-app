import type { CategorizedBy, TransactionKind, TransactionStatus } from '../../../shared/types';
import { GLOBAL_PK } from '../keys';
import type { ReferenceRepository } from '../repositories/reference-repository';

export interface Categorization {
  categoryId: string | null;
  tagIds: string[];
  kind: TransactionKind | null;
  categorizedBy: CategorizedBy;
  status: TransactionStatus;
}

/**
 * Deterministic categorization: the user's rule for the merchant, then the global rule.
 * Nothing else ever files a transaction; without a rule it waits for the user.
 */
export class Categorizer {
  constructor(private readonly reference: Pick<ReferenceRepository, 'getRule'>) {}

  async categorize(userId: string, merchantKey: string): Promise<Categorization> {
    const own = await this.reference.getRule(userId, merchantKey);
    if (own) {
      return {
        categoryId: own.categoryId ?? null,
        tagIds: own.tagIds ?? [],
        kind: own.kind ?? null,
        categorizedBy: 'rule',
        status: own.categoryId ? 'confirmed' : 'pending_review',
      };
    }
    const global = await this.reference.getRule(GLOBAL_PK, merchantKey);
    if (global) {
      return {
        categoryId: global.categoryId ?? null,
        tagIds: global.tagIds ?? [],
        kind: global.kind ?? null,
        categorizedBy: 'global',
        status: global.categoryId ? 'confirmed' : 'pending_review',
      };
    }
    return { categoryId: null, tagIds: [], kind: null, categorizedBy: 'none', status: 'pending_review' };
  }
}
