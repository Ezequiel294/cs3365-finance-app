'use server';

import type { Budget, BudgetChangesInput, BudgetProgress, BurndownSeries, NewBudgetInput } from '@finance/shared';
import { act, api } from '@/lib/api-client';
import { SessionService } from '@/lib/session';

const token = () => SessionService.requireIdToken({ canSetCookies: true });

/** BudgetActions (class diagram section 2). */
export async function createBudget(input: NewBudgetInput) {
  return act(async () => api.post<Budget>('/api/budgets', input, await token()));
}

export async function updateBudget(id: string, changes: BudgetChangesInput) {
  return act(async () => api.patch<Budget>(`/api/budgets/${encodeURIComponent(id)}`, changes, await token()));
}

export async function getProgress() {
  return act(async () => api.get<BudgetProgress[]>('/api/analytics/budgets', await token()));
}

export async function getBurndown(id: string) {
  return act(async () => api.get<BurndownSeries>(`/api/analytics/budgets/${encodeURIComponent(id)}?view=burndown`, await token()));
}
