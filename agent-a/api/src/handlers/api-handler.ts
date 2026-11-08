import { Router } from "@aws-lambda-powertools/event-handler/http";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import { ErrorHandler } from "../http/error-handler";
import { AnalyticsRouter } from "../routers/analytics-router";
import { BrokersRouter } from "../routers/brokers-router";
import { BudgetsRouter } from "../routers/budgets-router";
import { ConnectionsRouter } from "../routers/connections-router";
import { ImportsRouter } from "../routers/imports-router";
import { IngestRouter } from "../routers/ingest-router";
import { InvestmentsRouter } from "../routers/investments-router";
import { PortfolioRouter } from "../routers/portfolio-router";
import { ReferenceRouter } from "../routers/reference-router";
import { ReviewRouter } from "../routers/review-router";
import { RulesRouter } from "../routers/rules-router";
import { TransactionsRouter } from "../routers/transactions-router";
import type { ServiceFactory } from "../service-factory";

/** `ApiFn` entry point: one Powertools Router with one feature router mounted per route prefix. */
export class ApiHandler {
  private readonly app = new Router();

  constructor(private readonly services: ServiceFactory) {
    new ErrorHandler().register(this.app);
    this.mountRouters();
  }

  async handler(event: APIGatewayProxyEventV2, context: Context): Promise<APIGatewayProxyStructuredResultV2> {
    return this.app.resolve(event, context);
  }

  private mountRouters(): void {
    const api = [
      TransactionsRouter,
      ImportsRouter,
      ReviewRouter,
      RulesRouter,
      ConnectionsRouter,
      BudgetsRouter,
      AnalyticsRouter,
      InvestmentsRouter,
      BrokersRouter,
      PortfolioRouter,
      ReferenceRouter,
    ];
    for (const R of api) this.app.includeRouter(new R(this.services).router, { prefix: "/api" });
    this.app.includeRouter(new IngestRouter(this.services).router, { prefix: "/ingest" });
  }
}
