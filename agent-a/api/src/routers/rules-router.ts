import { Router } from '@aws-lambda-powertools/event-handler/http';
import { RuleInput } from '../../../shared/schemas';
import { AuthContext } from '../http/auth-context';
import { ok, param, readBody } from '../http/respond';
import type { ServiceFactory } from '../service-factory';

/** PUT /api/rules/{merchantKey}. */
export function rulesRouter(f: ServiceFactory): Router {
  const r = new Router();
  r.put('/:merchantKey', async (ctx) => {
    const { userId } = AuthContext.fromCognitoClaims(ctx.event);
    const input = await readBody(ctx, RuleInput);
    return ok(
      await f
        .ruleService()
        .upsert(userId, param(ctx, 'merchantKey'), input.categoryId ?? null, input.tagIds ?? [], input.kind ?? null),
    );
  });
  return r;
}
