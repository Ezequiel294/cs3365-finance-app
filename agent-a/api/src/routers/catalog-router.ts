import { Router } from '@aws-lambda-powertools/event-handler/http';
import { NewCatalogEntry } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { created, ok, readBody } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** GET /api/catalog, POST /api/categories, POST /api/tags (mounted at /api). */
export function catalogRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.get('/catalog', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.catalogService().list(userId));
  });
  r.post('/categories', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const { name } = await readBody(ctx, NewCatalogEntry);
    return created(await f.catalogService().createCategory(userId, name));
  });
  r.post('/tags', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const { name } = await readBody(ctx, NewCatalogEntry);
    return created(await f.catalogService().createTag(userId, name));
  });
  return r;
}
