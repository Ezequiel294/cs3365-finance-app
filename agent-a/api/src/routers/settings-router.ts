import { Router } from '@aws-lambda-powertools/event-handler/http';
import { SettingsChanges } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { ok, readBody } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** GET /api/settings, PUT /api/settings. */
export function settingsRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.get('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.settingsService().get(userId));
  });
  r.put('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.settingsService().update(userId, await readBody(ctx, SettingsChanges)));
  });
  return r;
}
