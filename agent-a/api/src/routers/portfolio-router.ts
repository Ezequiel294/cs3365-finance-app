import { Router } from '@aws-lambda-powertools/event-handler/http';
import { Ticker } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { ok, query, readParam } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** Valuation, liquidation, and the ticker lookup. */
export function portfolioRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.get('/valuation', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.valuationService().value(userId));
  });
  r.get('/liquidation', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    return ok(await f.valuationService().liquidation(userId));
  });
  r.get('/quote', async (ctx) => {
    AuthContext.fromCognitoClaims(ctx.event);
    const ticker = readParam(query(ctx).get('ticker') ?? '', Ticker, 'ticker');
    return ok(await f.valuationService().quote(ticker));
  });
  return r;
}
