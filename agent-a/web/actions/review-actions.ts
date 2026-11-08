"use server";

import { refresh } from "next/cache";
import { RuleInput, type ReviewList, type Rule, type Transaction } from "@finance/shared";
import { withApi, type Result } from "@/lib/result";

/** ReviewActions: the review inbox, duplicate decisions, and saving a correction as a rule. */
export async function listReview(): Promise<Result<ReviewList>> {
  return withApi((api, token) => api.get<ReviewList>("/api/review", token));
}

export async function mergeDuplicate(keepId: string, dropId: string): Promise<Result<Transaction>> {
  const result = await withApi((api, token) => api.post<Transaction>("/api/review/duplicates/merge", { keepId, dropId }, token));
  if (result.ok) refresh();
  return result;
}

export async function dismissDuplicate(id: string): Promise<Result<unknown>> {
  const result = await withApi((api, token) => api.post("/api/review/duplicates/dismiss", { id }, token));
  if (result.ok) refresh();
  return result;
}

export async function saveRule(merchantKey: string, categoryId: string, tagIds: string[]): Promise<Result<Rule>> {
  const parsed = RuleInput.safeParse({ categoryId, tagIds });
  if (!parsed.success) return { ok: false, error: "Pick a category" };
  return withApi((api, token) => api.put<Rule>(`/api/rules/${encodeURIComponent(merchantKey)}`, parsed.data, token));
}
