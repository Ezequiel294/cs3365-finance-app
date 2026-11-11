import { App, Tags } from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';
import { DataStack } from '../lib/data-stack';
import { WebStack } from '../lib/web-stack';

/**
 * Three stacks, as in diagrams/architecture.md: data → API → web.
 * The prefix (default FinanceAppA2) starts every stack and every generated
 * resource name; no resource sets a physical name.
 */
const app = new App();
const prefix: string = app.node.tryGetContext('prefix') ?? 'FinanceAppA2';
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-2' };

const data = new DataStack(app, `${prefix}Data`, { env, description: 'Finance app: DynamoDB tables (on-demand, PITR, RETAIN)' });
const api = new ApiStack(app, `${prefix}Api`, { env, data, description: 'Finance app: HTTP API, Lambdas, Cognito, raw-ingest bucket' });
new WebStack(app, `${prefix}Web`, { env, api, description: 'Finance app: Next.js on Lambda behind CloudFront (cdk-nextjs)' });

Tags.of(app).add('app', 'finance-app');
Tags.of(app).add('stackPrefix', prefix);
