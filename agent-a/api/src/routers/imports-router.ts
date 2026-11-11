import { Router } from '@aws-lambda-powertools/event-handler/http';
import { NewImport } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { bodyOf, json, userIdOf } from './http';

export function importsRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.post('/api/imports', async (ctx) => {
    const input = await bodyOf(ctx, NewImport);
    const start = await f.importService().createImport(userIdOf(ctx), input.accountId, input.sha256, input.size, input.fileName);
    return json(201, start);
  });

  app.get('/api/imports/:id', async (ctx) => json(200, await f.importService().getImport(userIdOf(ctx), ctx.params.id)));

  return app;
}
