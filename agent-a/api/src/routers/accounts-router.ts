import { Router } from '@aws-lambda-powertools/event-handler/http';
import { AccountChanges, NewAccount } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { bodyOf, json, userIdOf } from './http';

export function accountsRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.get('/api/accounts', async (ctx) => json(200, await f.accountService().list(userIdOf(ctx))));

  app.post('/api/accounts', async (ctx) => {
    const input = await bodyOf(ctx, NewAccount);
    return json(201, await f.accountService().create(userIdOf(ctx), input));
  });

  app.patch('/api/accounts/:id', async (ctx) => {
    const changes = await bodyOf(ctx, AccountChanges);
    return json(200, await f.accountService().update(userIdOf(ctx), ctx.params.id, changes, changes.version));
  });

  return app;
}
