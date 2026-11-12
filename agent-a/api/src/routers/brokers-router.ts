import { Router } from '@aws-lambda-powertools/event-handler/http';
import { BrokerFees, NewBroker } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { created, ok, param, readBody } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** GET /api/brokers, POST /api/brokers, PUT /api/brokers/{id}. */
export function brokersRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.get('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.brokerService().list(userId));
  });
  r.post('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const input = await readBody(ctx, NewBroker);
    return created(await f.brokerService().create(userId, input.name, input.fees));
  });
  r.put('/:id', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const input = await readBody(ctx, BrokerFees);
    return ok(await f.brokerService().update(userId, param(ctx, 'id'), input.fees, input.version));
  });
  return r;
}
