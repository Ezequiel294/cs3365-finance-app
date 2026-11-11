import { Router } from '@aws-lambda-powertools/event-handler/http';
import { LocalDate, NewTransaction, TransactionChanges } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { bodyOf, json, queryOf, userIdOf, valueOf } from './http';

export function transactionsRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.post('/api/transactions', async (ctx) => {
    const input = await bodyOf(ctx, NewTransaction);
    return json(201, await f.transactionService().create(userIdOf(ctx), input));
  });

  app.get('/api/transactions', async (ctx) => {
    const q = queryOf(ctx);
    const from = valueOf(q.get('from'), LocalDate, 'from');
    const to = valueOf(q.get('to'), LocalDate, 'to');
    const accountId = q.get('accountId') ?? undefined;
    return json(200, await f.transactionQueryService().list(userIdOf(ctx), from, to, { accountId }));
  });

  app.patch('/api/transactions/:id', async (ctx) => {
    const changes = await bodyOf(ctx, TransactionChanges);
    return json(200, await f.transactionService().update(userIdOf(ctx), ctx.params.id, changes, 'user'));
  });

  return app;
}
