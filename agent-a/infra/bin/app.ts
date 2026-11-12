import { App, Tags } from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';
import { DataStack } from '../lib/data-stack';
import { WebStack } from '../lib/web-stack';

const PREFIX = 'FinanceAppA3';
const app = new App();
// Only us-east-2 is allowed in this account.
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-2' };

const data = new DataStack(app, `${PREFIX}Data`, { env, description: 'Finance App data: DynamoDB tables and the catalog seed' });
const api = new ApiStack(app, `${PREFIX}Api`, {
  env,
  tables: data.tables,
  description: 'Finance App API: HTTP API, ApiFn, ImportWorkerFn, raw-ingest bucket, Cognito',
});

// `-c skipWeb=true` synthesizes only the data and API stacks (no Next.js build).
if (app.node.tryGetContext('skipWeb') !== 'true') {
  new WebStack(app, `${PREFIX}Web`, {
    env,
    apiUrl: api.apiUrl,
    userPoolId: api.userPool.userPoolId,
    userPoolClientId: api.userPoolClient.userPoolClientId,
    rawBucket: api.rawBucket,
    description: 'Finance App web: Next.js on Lambda behind CloudFront (cdk-nextjs)',
  });
}

Tags.of(app).add('app', 'finance-app');
Tags.of(app).add('prefix', PREFIX);
