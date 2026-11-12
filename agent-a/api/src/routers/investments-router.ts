import { Router } from '@aws-lambda-powertools/event-handler/http';
import { z } from 'zod';
import { InvestmentChanges, NewInvestmentTransaction } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { created, ok, param, query, readBody, readParam } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

const Months = z.coerce.number().int().min(1).max(24);

/** Investment transactions and monthly flows. */
export function investmentsRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.post('/transactions', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return created(await f.investmentService().record(userId, await readBody(ctx, NewInvestmentTransaction)));
  });
  r.get('/transactions', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.investmentService().list(userId));
  });
  r.patch('/transactions/:id', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.investmentService().correct(userId, param(ctx, 'id'), await readBody(ctx, InvestmentChanges)));
  });
  r.get('/flows', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const months = readParam(query(ctx).get('months') ?? '12', Months, 'months');
    return ok(await f.investmentService().monthlyFlows(userId, months));
  });
  return r;
}
