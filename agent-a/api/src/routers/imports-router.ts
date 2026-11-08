import { Router } from "@aws-lambda-powertools/event-handler/http";
import { NewImport } from "@finance/shared";
import { json } from "../http/error-handler";
import { body, param, userId } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `POST /api/imports`, `GET /api/imports/{id}` */
export class ImportsRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.post("/imports", async (reqCtx) => {
      const user = userId(reqCtx);
      const input = await body(reqCtx, NewImport);
      return json(201, await services.importService().createImport(user, input.accountId, input.sha256, input.fileName));
    });

    this.router.get("/imports/:id", async (reqCtx) => {
      const user = userId(reqCtx);
      return json(200, await services.importService().getImport(user, param(reqCtx, "id")));
    });
  }
}
