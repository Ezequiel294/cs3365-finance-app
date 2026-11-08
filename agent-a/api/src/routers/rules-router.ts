import { Router } from "@aws-lambda-powertools/event-handler/http";
import { RuleInput } from "@finance/shared";
import { json } from "../http/error-handler";
import { body, param, userId } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `PUT /api/rules/{merchantKey}` */
export class RulesRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.put("/rules/:merchantKey", async (reqCtx) => {
      const user = userId(reqCtx);
      const input = await body(reqCtx, RuleInput);
      return json(200, await services.ruleService().upsert(user, param(reqCtx, "merchantKey"), input.categoryId, input.tagIds));
    });
  }
}
