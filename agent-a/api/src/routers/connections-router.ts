import { Router } from '@aws-lambda-powertools/event-handler/http';
import type { ServiceFactory } from '../service-factory';
import { apiBaseOf, json, userIdOf } from './http';

export function connectionsRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.post('/api/connections/gmail', async (ctx) => json(201, await f.connectionService().createGmail(userIdOf(ctx), apiBaseOf(ctx))));

  app.get('/api/connections', async (ctx) => json(200, await f.connectionService().list(userIdOf(ctx))));

  app.post('/api/connections/gmail/:id/rotate', async (ctx) =>
    json(200, await f.connectionService().rotate(userIdOf(ctx), ctx.params.id, apiBaseOf(ctx))),
  );

  app.delete('/api/connections/:id', async (ctx) => {
    await f.connectionService().revoke(userIdOf(ctx), ctx.params.id);
    return json(200, { ok: true, status: 'REVOKED' });
  });

  return app;
}
