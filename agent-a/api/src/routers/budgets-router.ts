import { Router } from "@aws-lambda-powertools/event-handler/http";
import { BudgetChanges, NewBudget } from "@finance/shared";
import { json } from "../http/error-handler";
import { body, param, userId } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `POST /api/budgets`, `PATCH /api/budgets/{id}` */
export class BudgetsRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.post("/budgets", async (reqCtx) => {
      const user = userId(reqCtx);
      const input = await body(reqCtx, NewBudget);
      return json(201, await services.budgetService().create(user, input));
    });

    this.router.patch("/budgets/:id", async (reqCtx) => {
      const user = userId(reqCtx);
      const changes = await body(reqCtx, BudgetChanges);
      return json(200, await services.budgetService().update(user, param(reqCtx, "id"), changes));
    });
  }
}
