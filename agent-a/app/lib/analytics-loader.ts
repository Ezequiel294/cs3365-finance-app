import 'server-only';
import type { CategoryShare, MonthTotal, TagTotal } from '@/shared/api-types';
import { call } from '../actions/call';
import type { ActionResult } from './result';

/** Server-side data loader for the read-only analytics views (04-S01a, 04-S06). */
export const AnalyticsLoader = {
  spendingByCategory(month: string): Promise<ActionResult<CategoryShare[]>> {
    return call<CategoryShare[]>('get', `/api/analytics/spending?period=month&month=${month}&groupBy=category`);
  },
  spendingByTag(month: string): Promise<ActionResult<TagTotal[]>> {
    return call<TagTotal[]>('get', `/api/analytics/spending?period=month&month=${month}&groupBy=tag`);
  },
  monthlyTotals(from: string, to: string): Promise<ActionResult<MonthTotal[]>> {
    return call<MonthTotal[]>('get', `/api/analytics/spending?period=month&from=${from}&to=${to}`);
  },
};
