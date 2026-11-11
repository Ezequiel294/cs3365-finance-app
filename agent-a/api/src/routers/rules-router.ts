import { Router } from '@aws-lambda-powertools/event-handler/http';
import { RuleInput } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { bodyOf, json, userIdOf } from './http';

export function rulesRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.put('/api/rules/:merchantKey', async (ctx) => {
    const input = await bodyOf(ctx, RuleInput);
    const rule = await f
      .ruleService()
      .upsert(userIdOf(ctx), decodeURIComponent(ctx.params.merchantKey), input.categoryId, input.tagIds, input.kind);
    return json(200, rule);
  });

  return app;
}
