import { Router } from '@aws-lambda-powertools/event-handler/http';
import { BudgetChanges, NewBudget } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { created, ok, param, readBody } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** POST /api/budgets, PATCH /api/budgets/{id}. */
export function budgetsRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.post('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return created(await f.budgetService().create(userId, await readBody(ctx, NewBudget)));
  });
  r.patch('/:id', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.budgetService().update(userId, param(ctx, 'id'), await readBody(ctx, BudgetChanges)));
  });
  return r;
}
