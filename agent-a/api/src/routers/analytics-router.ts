import { Router } from '@aws-lambda-powertools/event-handler/http';
import { Month } from '@finance/shared';
import { ValidationError } from '../errors';
import type { ServiceFactory } from '../service-factory';
import { json, queryOf, userIdOf, valueOf } from './http';

export function analyticsRouter(f: ServiceFactory): Router {
  const app = new Router();

  /**
   * `?month=yyyy-mm&groupBy=category|tag` for a breakdown, or
   * `?from=yyyy-mm&to=yyyy-mm` for income and spending per month.
   */
  app.get('/api/analytics/spending', async (ctx) => {
    const q = queryOf(ctx);
    const userId = userIdOf(ctx);
    if (q.get('from') || q.get('to')) {
      const from = valueOf(q.get('from'), Month, 'from');
      const to = valueOf(q.get('to'), Month, 'to');
      if (from > to) throw new ValidationError('from must not be after to');
      return json(200, await f.spendingAnalyticsService().totals(userId, from, to));
    }
    const month = valueOf(q.get('month'), Month, 'month');
    const groupBy = q.get('groupBy') ?? 'category';
    if (groupBy === 'tag') return json(200, await f.spendingAnalyticsService().byTag(userId, month));
    if (groupBy !== 'category') throw new ValidationError('groupBy must be category or tag');
    return json(200, await f.spendingAnalyticsService().byCategory(userId, month));
  });

  app.get('/api/analytics/budgets', async (ctx) => json(200, await f.budgetAnalyticsService().progress(userIdOf(ctx))));

  app.get('/api/analytics/budgets/:id', async (ctx) =>
    json(200, await f.budgetAnalyticsService().burndown(userIdOf(ctx), ctx.params.id)),
  );

  return app;
}
