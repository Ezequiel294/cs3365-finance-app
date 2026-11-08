import { Router } from "@aws-lambda-powertools/event-handler/http";
import { json } from "../http/error-handler";
import { param, userId } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `POST /api/connections/gmail`, `GET /api/connections`, `POST /api/connections/gmail/{id}/rotate`, `DELETE /api/connections/{id}` */
export class ConnectionsRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.post("/connections/gmail", async (reqCtx) => {
      return json(201, await services.connectionService().createGmail(userId(reqCtx)));
    });

    this.router.get("/connections", async (reqCtx) => {
      return json(200, { items: await services.connectionService().list(userId(reqCtx)) });
    });

    this.router.post("/connections/gmail/:id/rotate", async (reqCtx) => {
      return json(200, await services.connectionService().rotate(userId(reqCtx), param(reqCtx, "id")));
    });

    this.router.delete("/connections/:id", async (reqCtx) => {
      await services.connectionService().revoke(userId(reqCtx), param(reqCtx, "id"));
      return json(200, { revoked: true });
    });
  }
}
