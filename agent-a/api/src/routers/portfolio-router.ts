import { Router } from "@aws-lambda-powertools/event-handler/http";
import { json } from "../http/error-handler";
import { userId } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `GET /api/portfolio/valuation`, `GET /api/portfolio/liquidation` */
export class PortfolioRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.get("/portfolio/valuation", async (reqCtx) => {
      return json(200, await services.valuationService().value(userId(reqCtx)));
    });

    this.router.get("/portfolio/liquidation", async (reqCtx) => {
      return json(200, await services.valuationService().liquidation(userId(reqCtx)));
    });
  }
}
