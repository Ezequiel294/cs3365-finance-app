import { Router } from "@aws-lambda-powertools/event-handler/http";
import { DismissDuplicate, MergeDuplicate } from "@finance/shared";
import { json } from "../http/error-handler";
import { body, query, userId } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `GET /api/review`, `POST /api/review/duplicates/merge`, `POST /api/review/duplicates/dismiss` */
export class ReviewRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.get("/review", async (reqCtx) => {
      const user = userId(reqCtx);
      if (query(reqCtx).type === "duplicates") return json(200, { duplicates: await services.reviewService().listDuplicates(user) });
      return json(200, await services.reviewService().list(user));
    });

    this.router.post("/review/duplicates/merge", async (reqCtx) => {
      const user = userId(reqCtx);
      const input = await body(reqCtx, MergeDuplicate);
      return json(200, await services.transactionService().merge(user, input.keepId, input.dropId));
    });

    this.router.post("/review/duplicates/dismiss", async (reqCtx) => {
      const user = userId(reqCtx);
      const input = await body(reqCtx, DismissDuplicate);
      await services.reviewService().dismiss(user, input.id);
      return json(200, { dismissed: input.id });
    });
  }
}
