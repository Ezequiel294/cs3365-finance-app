import { Router } from '@aws-lambda-powertools/event-handler/http';
import { DismissInput, MergeInput } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { bodyOf, json, queryOf, userIdOf } from './http';

export function reviewRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.get('/api/review', async (ctx) => {
    const userId = userIdOf(ctx);
    if (queryOf(ctx).get('type') === 'duplicates') return json(200, await f.reviewService().listDuplicates(userId));
    return json(200, await f.reviewService().list(userId));
  });

  app.post('/api/review/duplicates/merge', async (ctx) => {
    const { keepId, dropId } = await bodyOf(ctx, MergeInput);
    return json(200, await f.transactionService().merge(userIdOf(ctx), keepId, dropId));
  });

  app.post('/api/review/duplicates/dismiss', async (ctx) => {
    const { id } = await bodyOf(ctx, DismissInput);
    await f.reviewService().dismiss(userIdOf(ctx), id);
    return json(200, { ok: true });
  });

  app.post('/api/review/messages/:messageId/retry', async (ctx) => {
    const messageId = decodeURIComponent(ctx.params.messageId);
    return json(200, await f.reviewService().retry(userIdOf(ctx), messageId));
  });

  return app;
}
