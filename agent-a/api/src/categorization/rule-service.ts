import { MERCHANT_KEY_PATTERN, type Rule } from "@finance/shared";
import { ValidationError } from "../http/errors";
import type { ReferenceRepository } from "../repositories/reference-repository";
import { LabelValidator } from "./label-validator";

/** Saves a user's merchant rule. The rule applies to transactions that arrive from then on. */
export class RuleService {
  private readonly labels: LabelValidator;

  constructor(private readonly reference: ReferenceRepository) {
    this.labels = new LabelValidator(reference);
  }

  async upsert(userId: string, merchantKey: string, categoryId: string, tagIds: string[]): Promise<Rule> {
    if (!MERCHANT_KEY_PATTERN.test(merchantKey) || merchantKey === "unknown") {
      throw new ValidationError("merchantKey must be a normalized merchant key");
    }
    await this.labels.validate(userId, categoryId, tagIds);
    const rule: Rule = { merchantKey, categoryId, tagIds: [...new Set(tagIds)], scope: "USER" };
    await this.reference.putRule(userId, rule);
    return rule;
  }
}
