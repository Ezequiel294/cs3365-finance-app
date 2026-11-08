import { Router } from "@aws-lambda-powertools/event-handler/http";
import { SpendingQuery } from "@finance/shared";
import { json } from "../http/error-handler";
import { ValidationError } from "../http/errors";
import { param, query, userId, validate } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `GET /api/analytics/spending`, `GET /api/analytics/budgets`, `GET /api/analytics/budgets/{id}` */
export class AnalyticsRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.get("/analytics/spending", async (reqCtx) => {
      const user = userId(reqCtx);
      const q = validate(SpendingQuery, query(reqCtx));
      const spending = services.spendingAnalyticsService();
      if (q.from && q.to) return json(200, { months: await spending.totals(user, q.from, q.to) });
      if (!q.month) throw new ValidationError("month, or from and to, is required");
      if (q.groupBy === "tag") return json(200, { month: q.month, tags: await spending.byTag(user, q.month) });
      return json(200, { month: q.month, categories: await spending.byCategory(user, q.month) });
    });

    this.router.get("/analytics/budgets", async (reqCtx) => {
      return json(200, { items: await services.budgetAnalyticsService().progress(userId(reqCtx)) });
    });

    this.router.get("/analytics/budgets/:id", async (reqCtx) => {
      return json(200, await services.budgetAnalyticsService().burndown(userId(reqCtx), param(reqCtx, "id")));
    });
  }
}
