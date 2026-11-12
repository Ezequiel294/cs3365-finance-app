import { Router } from '@aws-lambda-powertools/event-handler/http';
import { addDays } from '../../../shared/dates';
import { NewTransaction, TransactionChanges, isoDate } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { created, ok, param, query, readBody, readParam } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** POST /api/transactions, GET /api/transactions, PATCH /api/transactions/{id}. */
export function transactionsRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.post('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const input = await readBody(ctx, NewTransaction);
    return created(await f.transactionService().create(userId, input));
  });
  r.get('/', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const q = query(ctx);
    const to = readParam(q.get('to') ?? f.clock.today('America/Costa_Rica'), isoDate, 'to');
    const from = readParam(q.get('from') ?? addDays(to, -30), isoDate, 'from');
    const accountId = q.get('accountId') ?? undefined;
    return ok(await f.transactionQueryService().list(userId, from, to, { accountId }));
  });
  r.patch('/:id', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const changes = await readBody(ctx, TransactionChanges);
    return ok(await f.transactionService().update(userId, param(ctx, 'id'), changes, 'user'));
  });
  return r;
}
