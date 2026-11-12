'use server';
import type { BudgetProgress, BurndownSeries } from '@/shared/api-types';
import { BudgetChanges, NewBudget, zodFields } from '@/shared/schemas';
import type { Budget } from '@/shared/types';
import { failure, type ActionResult } from '../lib/result';
import { call, enc } from './call';

export async function createBudget(input: unknown): Promise<ActionResult<Budget>> {
  const parsed = NewBudget.safeParse(input);
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<Budget>('post', '/api/budgets', parsed.data);
}

export async function updateBudget(id: string, changes: unknown): Promise<ActionResult<Budget>> {
  const parsed = BudgetChanges.safeParse(changes);
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<Budget>('patch', `/api/budgets/${enc(id)}`, parsed.data);
}

export async function getProgress(): Promise<ActionResult<BudgetProgress[]>> {
  return call<BudgetProgress[]>('get', '/api/analytics/budgets');
}

export async function getBurndown(id: string): Promise<ActionResult<BurndownSeries>> {
  return call<BurndownSeries>('get', `/api/analytics/budgets/${enc(id)}?view=burndown`);
}
