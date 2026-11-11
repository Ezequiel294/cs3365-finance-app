import { Router } from '@aws-lambda-powertools/event-handler/http';
import { BudgetChanges, NewBudget } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { bodyOf, json, userIdOf } from './http';

export function budgetsRouter(f: ServiceFactory): Router {
  const app = new Router();

  // Listing budget definitions supports the budgets page; progress is under /api/analytics/budgets.
  app.get('/api/budgets', async (ctx) => json(200, await f.budgetService().list(userIdOf(ctx))));

  app.post('/api/budgets', async (ctx) => {
    const input = await bodyOf(ctx, NewBudget);
    return json(201, await f.budgetService().create(userIdOf(ctx), input));
  });

  app.patch('/api/budgets/:id', async (ctx) => {
    const changes = await bodyOf(ctx, BudgetChanges);
    return json(200, await f.budgetService().update(userIdOf(ctx), ctx.params.id, changes));
  });

  return app;
}
