"use server";

import { refresh } from "next/cache";
import { BudgetChanges, NewBudget, type Budget, type BudgetProgress, type BurndownSeries } from "@finance/shared";
import { withApi, type Result } from "@/lib/result";

/** BudgetActions: create and change budgets, read progress and the burn-down series. */
export async function createBudget(input: unknown): Promise<Result<Budget>> {
  const parsed = NewBudget.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the budget" };
  const result = await withApi((api, token) => api.post<Budget>("/api/budgets", parsed.data, token));
  if (result.ok) refresh();
  return result;
}

export async function updateBudget(id: string, changes: unknown): Promise<Result<Budget>> {
  const parsed = BudgetChanges.safeParse(changes);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the budget" };
  const result = await withApi((api, token) => api.patch<Budget>(`/api/budgets/${encodeURIComponent(id)}`, parsed.data, token));
  if (result.ok) refresh();
  return result;
}

export async function getProgress(): Promise<Result<BudgetProgress[]>> {
  return withApi(async (api, token) => (await api.get<{ items: BudgetProgress[] }>("/api/analytics/budgets", token)).items);
}

export async function getBurndown(id: string): Promise<Result<BurndownSeries>> {
  return withApi((api, token) => api.get<BurndownSeries>(`/api/analytics/budgets/${encodeURIComponent(id)}?view=burndown`, token));
}
