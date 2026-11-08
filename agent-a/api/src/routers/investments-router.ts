import { Router } from "@aws-lambda-powertools/event-handler/http";
import { InvestmentChanges, NewInvestmentTransaction } from "@finance/shared";
import { json } from "../http/error-handler";
import { body, param, userId } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `POST /api/investments/transactions`, `PATCH /api/investments/transactions/{id}` */
export class InvestmentsRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.post("/investments/transactions", async (reqCtx) => {
      const user = userId(reqCtx);
      const input = await body(reqCtx, NewInvestmentTransaction);
      return json(201, await services.investmentService().record(user, input));
    });

    this.router.patch("/investments/transactions/:id", async (reqCtx) => {
      const user = userId(reqCtx);
      const changes = await body(reqCtx, InvestmentChanges);
      return json(200, await services.investmentService().correct(user, param(reqCtx, "id"), changes));
    });

    // Supporting route (not in the design's route table): lists trades so older ones can be corrected.
    this.router.get("/investments/transactions", async (reqCtx) => {
      return json(200, { items: await services.investmentService().list(userId(reqCtx)) });
    });
  }
}
