import { App, Tags } from "aws-cdk-lib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiStack } from "../lib/api-stack";
import { DataStack } from "../lib/data-stack";
import { WebStack } from "../lib/web-stack";

const app = new App();
const prefix: string = app.node.tryGetContext("prefix") ?? "FinanceAppA1";
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Only us-east-2 is allowed in this account. The account comes from the caller's credentials.
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-2" };

const data = new DataStack(app, `${prefix}Data`, { env, description: "Finance app data: DynamoDB tables" });
const api = new ApiStack(app, `${prefix}Api`, { env, data, workspaceRoot, description: "Finance app API: Cognito, HTTP API, Lambdas, raw-ingest bucket" });
new WebStack(app, `${prefix}Web`, { env, api, workspaceRoot, description: "Finance app web: Next.js on Lambda behind CloudFront" });

Tags.of(app).add("app", "FinanceApp");
