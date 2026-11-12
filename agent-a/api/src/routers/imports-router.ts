import { Router } from '@aws-lambda-powertools/event-handler/http';
import { NewImport } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { created, ok, param, readBody } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** POST /api/imports, GET /api/imports/{id}. */
export function importsRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.post('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const input = await readBody(ctx, NewImport);
    return created(await f.importService().createImport(userId, input.accountId, input.sha256, input.size, input.fileName));
  });
  r.get('/:id', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.importService().getImport(userId, param(ctx, 'id')));
  });
  return r;
}
