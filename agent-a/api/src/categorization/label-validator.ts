import { UNCATEGORIZED_ID } from "@finance/shared";
import { ValidationError } from "../http/errors";
import type { ReferenceRepository } from "../repositories/reference-repository";

/** Checks that category and tag IDs exist (GLOBAL or this user's) and are not archived. */
export class LabelValidator {
  constructor(private readonly reference: ReferenceRepository) {}

  async validate(userId: string, categoryId: string | null | undefined, tagIds: string[] = []): Promise<void> {
    if (categoryId) await this.validateCategories(userId, [categoryId]);
    if (tagIds.length) await this.validateTags(userId, tagIds);
  }

  async validateCategories(userId: string, ids: string[]): Promise<void> {
    const wanted = [...new Set(ids)];
    if (wanted.includes(UNCATEGORIZED_ID)) throw new ValidationError("invalid category or tag", "INVALID_CATEGORY_OR_TAG");
    const found = await this.reference.getCategories(userId, wanted);
    const ok = new Set(found.filter((c) => !c.archived).map((c) => c.id));
    if (wanted.some((id) => !ok.has(id))) throw new ValidationError("invalid category or tag", "INVALID_CATEGORY_OR_TAG");
  }

  async validateTags(userId: string, ids: string[]): Promise<void> {
    const wanted = [...new Set(ids)];
    const found = await this.reference.getTags(userId, wanted);
    const ok = new Set(found.filter((t) => !t.archived).map((t) => t.id));
    if (wanted.some((id) => !ok.has(id))) throw new ValidationError("invalid category or tag", "INVALID_CATEGORY_OR_TAG");
  }
}
