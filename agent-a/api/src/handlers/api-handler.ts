import { Router } from '@aws-lambda-powertools/event-handler/http';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { ErrorHandler } from '../http/error-handler';
import { accountsRouter } from '../routers/accounts-router';
import { analyticsRouter } from '../routers/analytics-router';
import { brokersRouter } from '../routers/brokers-router';
import { budgetsRouter } from '../routers/budgets-router';
import { catalogRouter } from '../routers/catalog-router';
import { connectionsRouter } from '../routers/connections-router';
import { importsRouter } from '../routers/imports-router';
import { ingestRouter } from '../routers/ingest-router';
import { investmentsRouter } from '../routers/investments-router';
import { portfolioRouter } from '../routers/portfolio-router';
import { reviewRouter } from '../routers/review-router';
import { rulesRouter } from '../routers/rules-router';
import { settingsRouter } from '../routers/settings-router';
import { transactionsRouter } from '../routers/transactions-router';
import { ServiceFactory } from '../service-factory';

/** The ApiFn entry point: one Powertools Router with one feature router per route prefix. */
export class ApiHandler {
  private readonly app = new Router();

  constructor(private readonly factory: ServiceFactory = new ServiceFactory()) {
    new ErrorHandler().register(this.app);
    this.mountRouters();
  }

  private mountRouters(): void {
    const f = this.factory;
    this.app
      .includeRouter(transactionsRouter(f), { prefix: '/api/transactions' })
      .includeRouter(accountsRouter(f), { prefix: '/api/accounts' })
      .includeRouter(importsRouter(f), { prefix: '/api/imports' })
      .includeRouter(reviewRouter(f), { prefix: '/api/review' })
      .includeRouter(rulesRouter(f), { prefix: '/api/rules' })
      .includeRouter(connectionsRouter(f), { prefix: '/api/connections' })
      .includeRouter(ingestRouter(f), { prefix: '/ingest/gmail' })
      .includeRouter(budgetsRouter(f), { prefix: '/api/budgets' })
      .includeRouter(analyticsRouter(f), { prefix: '/api/analytics' })
      .includeRouter(investmentsRouter(f), { prefix: '/api/investments' })
      .includeRouter(brokersRouter(f), { prefix: '/api/brokers' })
      .includeRouter(portfolioRouter(f), { prefix: '/api/portfolio' })
      .includeRouter(catalogRouter(f), { prefix: '/api' })
      .includeRouter(settingsRouter(f), { prefix: '/api/settings' });
  }

  handler = (event: APIGatewayProxyEventV2, context: Context) => this.app.resolve(event, context);
}
