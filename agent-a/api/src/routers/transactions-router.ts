import { Router } from "@aws-lambda-powertools/event-handler/http";
import { NewTransaction, TransactionChanges, TransactionsQuery } from "@finance/shared";
import { json } from "../http/error-handler";
import { body, param, query, userId, validate } from "../http/request";
import type { ServiceFactory } from "../service-factory";

/** `POST /api/transactions`, `GET /api/transactions`, `PATCH /api/transactions/{id}` */
export class TransactionsRouter {
  readonly router = new Router();

  constructor(services: ServiceFactory) {
    this.router.post("/transactions", async (reqCtx) => {
      const user = userId(reqCtx);
      const input = await body(reqCtx, NewTransaction);
      return json(201, await services.transactionService().create(user, input));
    });

    this.router.get("/transactions", async (reqCtx) => {
      const user = userId(reqCtx);
      const q = validate(TransactionsQuery, query(reqCtx));
      const items = await services.transactionQueryService().list(user, q.from, q.to, q);
      return json(200, { items });
    });

    this.router.patch("/transactions/:id", async (reqCtx) => {
      const user = userId(reqCtx);
      const changes = await body(reqCtx, TransactionChanges);
      return json(200, await services.transactionService().update(user, param(reqCtx, "id"), changes, "user"));
    });
  }
}
