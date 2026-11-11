import { Router } from '@aws-lambda-powertools/event-handler/http';
import { TickerSchema } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { json, queryOf, userIdOf, valueOf } from './http';

export function portfolioRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.get('/api/portfolio/valuation', async (ctx) => json(200, await f.valuationService().value(userIdOf(ctx))));

  app.get('/api/portfolio/liquidation', async (ctx) => json(200, await f.valuationService().liquidation(userIdOf(ctx))));

  app.get('/api/portfolio/quote', async (ctx) => {
    userIdOf(ctx);
    const ticker = valueOf(queryOf(ctx).get('ticker'), TickerSchema, 'ticker');
    return json(200, await f.valuationService().quote(ticker));
  });

  return app;
}
