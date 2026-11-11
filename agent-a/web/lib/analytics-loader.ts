import 'server-only';
import type { BudgetProgress, CategoryShare, ConnectionView, MonthTotal, ReviewList, TagTotal } from '@finance/shared';
import { api } from './api-client';
import { SessionService } from './session';

/** Server-side data loader for the dashboard and cash-flow pages. */
export const AnalyticsLoader = {
  async spendingByCategory(month: string, returnTo: string): Promise<CategoryShare[]> {
    const token = await SessionService.requireIdToken({ returnTo });
    return api.get(`/api/analytics/spending?period=month&month=${month}&groupBy=category`, token);
  },

  async spendingByTag(month: string, returnTo: string): Promise<TagTotal[]> {
    const token = await SessionService.requireIdToken({ returnTo });
    return api.get(`/api/analytics/spending?month=${month}&groupBy=tag`, token);
  },

  async monthlyTotals(from: string, to: string, returnTo: string): Promise<MonthTotal[]> {
    const token = await SessionService.requireIdToken({ returnTo });
    return api.get(`/api/analytics/spending?period=month&from=${from}&to=${to}`, token);
  },

  async budgetProgress(returnTo: string): Promise<BudgetProgress[]> {
    const token = await SessionService.requireIdToken({ returnTo });
    return api.get('/api/analytics/budgets', token);
  },

  async connections(returnTo: string): Promise<ConnectionView[]> {
    const token = await SessionService.requireIdToken({ returnTo });
    return api.get('/api/connections', token);
  },

  async reviewCount(returnTo: string): Promise<number> {
    const token = await SessionService.requireIdToken({ returnTo });
    return (await api.get<ReviewList>('/api/review', token)).count;
  },
};

/** Loads page data with the session's token; used by the server-rendered pages. */
export async function load<T>(path: string, returnTo: string): Promise<T> {
  const token = await SessionService.requireIdToken({ returnTo });
  return api.get<T>(path, token);
}
