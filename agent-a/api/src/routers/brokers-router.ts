import { Router } from '@aws-lambda-powertools/event-handler/http';
import { BrokerFees, NewBroker } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { bodyOf, json, userIdOf } from './http';

export function brokersRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.get('/api/brokers', async (ctx) => json(200, await f.brokerService().list(userIdOf(ctx))));

  app.post('/api/brokers', async (ctx) => {
    const input = await bodyOf(ctx, NewBroker);
    return json(201, await f.brokerService().create(userIdOf(ctx), input.name, input.fees));
  });

  app.put('/api/brokers/:id', async (ctx) => {
    const input = await bodyOf(ctx, BrokerFees);
    return json(200, await f.brokerService().update(userIdOf(ctx), ctx.params.id, input.fees, input.version));
  });

  return app;
}
