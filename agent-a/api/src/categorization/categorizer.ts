import type { CategorizedBy, TransactionStatus } from "@finance/shared";
import { Keys } from "../keys";
import type { ReferenceRepository } from "../repositories/reference-repository";

export interface Categorization {
  categoryId?: string;
  tagIds: string[];
  categorizedBy: CategorizedBy;
  status: TransactionStatus;
}

export const UNCATEGORIZED: Categorization = { tagIds: [], categorizedBy: "none", status: "pending_review" };

/**
 * Deterministic: the user's own rule for the merchant first, then the global rule. When neither
 * exists the transaction is left uncategorized and goes to the review inbox.
 */
export class Categorizer {
  constructor(private readonly reference: ReferenceRepository) {}

  async categorize(userId: string, merchantKey: string | undefined): Promise<Categorization> {
    if (!merchantKey) return { ...UNCATEGORIZED };
    const userRule = await this.reference.getRule(userId, merchantKey);
    if (userRule) return { categoryId: userRule.categoryId, tagIds: userRule.tagIds, categorizedBy: "rule", status: "confirmed" };
    const globalRule = await this.reference.getRule(Keys.GLOBAL, merchantKey);
    if (globalRule) return { categoryId: globalRule.categoryId, tagIds: globalRule.tagIds, categorizedBy: "global", status: "confirmed" };
    return { ...UNCATEGORIZED };
  }
}
