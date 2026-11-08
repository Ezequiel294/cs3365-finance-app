import { Router } from "@aws-lambda-powertools/event-handler/http";
import { NewAccount, NewLabel, SettingsInput } from "@finance/shared";
import { json } from "../http/error-handler";
import { body, userId } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/**
 * Supporting routes the in-scope stories need but the design does not list:
 * `GET /api/reference`, `POST /api/accounts`, `POST /api/categories`, `POST /api/tags`,
 * `GET /api/settings`, `PUT /api/settings`.
 */
export class ReferenceRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.get("/reference", async (reqCtx) => json(200, await services.referenceService().list(userId(reqCtx))));

    this.router.post("/accounts", async (reqCtx) => {
      const user = userId(reqCtx);
      return json(201, await services.referenceService().createAccount(user, await body(reqCtx, NewAccount)));
    });

    this.router.post("/categories", async (reqCtx) => {
      const user = userId(reqCtx);
      return json(201, await services.referenceService().createCategory(user, await body(reqCtx, NewLabel)));
    });

    this.router.post("/tags", async (reqCtx) => {
      const user = userId(reqCtx);
      return json(201, await services.referenceService().createTag(user, await body(reqCtx, NewLabel)));
    });

    this.router.get("/settings", async (reqCtx) => json(200, await services.referenceService().getSettings(userId(reqCtx))));

    this.router.put("/settings", async (reqCtx) => {
      const user = userId(reqCtx);
      return json(200, await services.referenceService().putSettings(user, await body(reqCtx, SettingsInput)));
    });
  }
}
