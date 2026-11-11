import { Router } from '@aws-lambda-powertools/event-handler/http';
import { InvestmentChanges, NewInvestmentTransaction } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { bodyOf, json, userIdOf } from './http';

export function investmentsRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.post('/api/investments/transactions', async (ctx) => {
    const input = await bodyOf(ctx, NewInvestmentTransaction);
    return json(201, await f.investmentService().record(userIdOf(ctx), input));
  });

  app.get('/api/investments/transactions', async (ctx) => json(200, await f.investmentService().list(userIdOf(ctx))));

  app.patch('/api/investments/transactions/:id', async (ctx) => {
    const changes = await bodyOf(ctx, InvestmentChanges);
    return json(200, await f.investmentService().correct(userIdOf(ctx), ctx.params.id, changes));
  });

  return app;
}
