import { Router } from '@aws-lambda-powertools/event-handler/http';
import { DismissDuplicate, MergeDuplicate } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { ok, param, query, readBody } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** GET /api/review, duplicates merge and dismiss, and retrying an email that was not understood. */
export function reviewRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.get('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    if (query(ctx).get('type') === 'duplicates') return ok(await f.reviewService().listDuplicates(userId));
    return ok(await f.reviewService().list(userId));
  });
  r.post('/duplicates/merge', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const { keepId, dropId } = await readBody(ctx, MergeDuplicate);
    return ok(await f.transactionService().merge(userId, keepId, dropId));
  });
  r.post('/duplicates/dismiss', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const { id } = await readBody(ctx, DismissDuplicate);
    await f.reviewService().dismiss(userId, id);
    return ok({ dismissed: id });
  });
  r.post('/messages/:messageId/retry', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.reviewService().retry(userId, param(ctx, 'messageId')));
  });
  return r;
}
