import { Router } from '@aws-lambda-powertools/event-handler/http';
import { addMonths } from '../../../shared/dates';
import { isoMonth } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { ok, param, query, readParam } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** Spending totals and breakdowns, budget progress and burn-down. */
export function analyticsRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.get('/spending', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const q = query(ctx);
    const month = q.get('month');
    if (month && q.get('groupBy')) {
      const m = readParam(month, isoMonth, 'month');
      const svc = f.spendingAnalyticsService();
      return ok(q.get('groupBy') === 'tag' ? await svc.byTag(userId, m) : await svc.byCategory(userId, m));
    }
    const current = f.clock.today('America/Costa_Rica').slice(0, 7);
    const to = readParam(q.get('to') ?? month ?? current, isoMonth, 'to');
    const from = readParam(q.get('from') ?? addMonths(to, -11), isoMonth, 'from');
    return ok(await f.spendingAnalyticsService().totals(userId, from, to));
  });
  r.get('/budgets', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.budgetAnalyticsService().progress(userId));
  });
  r.get('/budgets/:id', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.budgetAnalyticsService().burndown(userId, param(ctx, 'id')));
  });
  return r;
}
