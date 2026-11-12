import { Router } from '@aws-lambda-powertools/event-handler/http';
import { AccountChanges, NewAccount } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { created, ok, param, readBody } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** GET /api/accounts, POST /api/accounts, PATCH /api/accounts/{id}. */
export function accountsRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.get('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.accountService().list(userId));
  });
  r.post('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return created(await f.accountService().create(userId, await readBody(ctx, NewAccount)));
  });
  r.patch('/:id', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const changes = await readBody(ctx, AccountChanges);
    return ok(await f.accountService().update(userId, param(ctx, 'id'), changes, changes.version));
  });
  return r;
}
