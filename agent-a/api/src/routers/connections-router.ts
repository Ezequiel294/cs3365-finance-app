import { Router } from '@aws-lambda-powertools/event-handler/http';
import { AuthContext } from '../http/auth-context';
import { created, ok, param } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** The Gmail connection: create, list, rotate the key, revoke. */
export function connectionsRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.post('/gmail', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return created(await f.connectionService().createGmail(userId));
  });
  r.get('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.connectionService().list(userId));
  });
  r.post('/gmail/:id/rotate', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.connectionService().rotate(userId, param(ctx, 'id')));
  });
  r.delete('/:id', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    await f.connectionService().revoke(userId, param(ctx, 'id'));
    return ok({ revoked: true });
  });
  return r;
}
