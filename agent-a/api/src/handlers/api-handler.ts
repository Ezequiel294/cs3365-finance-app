import { Router } from '@aws-lambda-powertools/event-handler/http';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { accountsRouter } from '../routers/accounts-router';
import { analyticsRouter } from '../routers/analytics-router';
import { brokersRouter } from '../routers/brokers-router';
import { budgetsRouter } from '../routers/budgets-router';
import { connectionsRouter } from '../routers/connections-router';
import { ErrorHandler } from '../routers/http';
import { importsRouter } from '../routers/imports-router';
import { ingestRouter } from '../routers/ingest-router';
import { investmentsRouter } from '../routers/investments-router';
import { portfolioRouter } from '../routers/portfolio-router';
import { reviewRouter } from '../routers/review-router';
import { rulesRouter } from '../routers/rules-router';
import { taxonomyRouter } from '../routers/taxonomy-router';
import { transactionsRouter } from '../routers/transactions-router';
import { ServiceFactory } from '../service-factory';

/** The `ApiFn` entry point: one Powertools `Router` with one feature router per route prefix. */
export class ApiHandler {
  private readonly app = new Router();
  private readonly errors = new ErrorHandler();

  constructor(private readonly factory: ServiceFactory) {
    this.mountRouters();
  }

  private mountRouters(): void {
    const f = this.factory;
    for (const router of [
      transactionsRouter(f),
      accountsRouter(f),
      importsRouter(f),
      reviewRouter(f),
      rulesRouter(f),
      connectionsRouter(f),
      ingestRouter(f),
      budgetsRouter(f),
      analyticsRouter(f),
      investmentsRouter(f),
      brokersRouter(f),
      portfolioRouter(f),
      taxonomyRouter(f),
    ]) {
      this.app.includeRouter(router);
    }
    this.errors.register(this.app);
  }

  async handler(event: APIGatewayProxyEventV2, context: Context) {
    return this.app.resolve(event, context);
  }
}
