import { Router } from "@aws-lambda-powertools/event-handler/http";
import { BrokerRule } from "@finance/shared";
import { json } from "../http/error-handler";
import { body, param, userId } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `PUT /api/brokers/{id}` (version 0 creates), plus `GET /api/brokers` for the portfolio screens. */
export class BrokersRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.put("/brokers/:id", async (reqCtx) => {
      const user = userId(reqCtx);
      const { version, ...rule } = await body(reqCtx, BrokerRule);
      return json(200, await services.brokerService().update(user, param(reqCtx, "id"), rule, version));
    });

    this.router.get("/brokers", async (reqCtx) => {
      return json(200, { items: await services.brokerService().list(userId(reqCtx)) });
    });
  }
}
