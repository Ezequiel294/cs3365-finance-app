# One-shot build prompt: agent B, iteration 1

You are building a complete application in a single session, from design documents only.
Work autonomously from start to finish. Do not ask questions and do not wait for
confirmation. When something is unclear, make the most reasonable decision that fits the
documents, write it down in `IMPLEMENTATION_NOTES.md`, and keep going.

## Your inputs

Your working directory is `agent-b/`. Treat it as the entire project.

- `diagrams/` is the design: `architecture.md` (and `architecture.drawio`), `context.md`,
  `class-diagram.md`, and `sequences/` (a `README.md` plus one file per module).
- `one-pagers/` holds the original product requirements, for context.

Rules for the inputs:

- Read only files inside your working directory. Do not read, list, or change anything
  outside it: no parent directories, no sibling directories, no git history or other
  branches. The only exception is the AWS credential files described below, which you use
  only through environment variables and never open.
- The diagrams define the scope. Build every user story that has a sequence diagram (the
  index is in `diagrams/sequences/README.md`). Stories listed there as not covered are out
  of scope: do not build them.
- Where the diagrams and the one-pagers disagree, follow the diagrams. The differences are
  listed in `diagrams/sequences/README.md` under "Where the design differs from the
  one-pagers".
- Follow the architecture, the class diagram, the routes, the DynamoDB keys, and the
  conventions in the diagrams. Use the class and method names from the class diagram.

## What to build

Build everything inside your working directory:

1. The Next.js web app, deployed with the `cdk-nextjs` construct (`NextjsGlobalFunctions`)
   as shown in the architecture diagram.
2. The API: `ApiFn` and `ImportWorkerFn` built from one code bundle, behind an API Gateway
   HTTP API with a Cognito JWT authorizer.
3. The infrastructure as an AWS CDK app in TypeScript, split into the data, API, and web
   stacks shown in the architecture diagram.
4. The shared Zod schemas used by both the web app and the API.
5. The Gmail Apps Script (for example `gmail-script/Code.gs`) that users paste into their
   own Google account.
6. The bank template registry with the generic email and CSV parsers. Real bank samples are
   not available yet, so add one example email template and one example CSV template,
   clearly marked as placeholders, with tests that use synthetic fixtures.
7. Market prices: no provider has been chosen. Implement `MarketPriceProvider` with a
   provider of your choice that has a free tier. Read its API key from the SSM parameter
   `/FinanceApp/prices/apiKey`. That parameter does not exist yet, so when it is missing the
   app must report prices as unavailable, as the design describes for a failed price feed.
8. Unit tests for the services, calculators, parsers, and the rollup planner. Tests must run
   without AWS, with AWS clients mocked at the client boundary.
9. A `README.md` in your working directory explaining how to install, test, deploy, and use
   the app.

## Tooling

- Node.js 24 is installed. Write TypeScript.
- The machine's default npm registry is a private mirror that will not work for you. Before
  installing anything, create a `.npmrc` containing `registry=https://registry.npmjs.org/`
  at the root of every npm project or workspace you create.
- Docker is not available, and the design does not need it.
- Do not use git. Do not run `git commit`, `push`, `checkout`, `switch`, `branch`, `stash`,
  `reset`, or `clean`. The person running you will commit your work.
- Stop any server or watcher you start before you finish.

## AWS account

**Environment.** A personal AWS account on the AWS Free plan. Only the `us-east-2` Region is
allowed; `us-east-1` and every other Region are blocked by the account's guardrails.
CloudFront works because it is global. This rules out custom domains and ACM certificates,
Lambda@Edge, and WAF on CloudFront. Use the default `*.cloudfront.net` domain.

**Credentials.** Use the profile `finance-agent`, which lives in non-standard files. Every
command that talks to AWS (`aws`, `npx cdk`, or a script that uses the AWS SDK) must run
with these variables. Your shell may not keep exported variables between commands, so put
them in front of each command:

```
AWS_CONFIG_FILE=$HOME/.finance-aws/config AWS_SHARED_CREDENTIALS_FILE=$HOME/.finance-aws/credentials AWS_PROFILE=finance-agent AWS_REGION=us-east-2 <command>
```

- Start by running `aws sts get-caller-identity` with those variables. The ARN must contain
  `assumed-role/FinanceAgentDevRole`.
- If an `aws` CLI command fails with an error about `.aws/cli/cache` or "Operation not
  permitted", also add `HOME=$HOME/.finance-aws` in front of that `aws` command. Do this
  only for the `aws` CLI, never for `npm`, `npx`, `cdk`, or `node`.
- Never open, print, copy, or change the credential files. Never use any other profile or
  credentials.

**What your role (`FinanceAgentDevRole`) can do.**

- Read almost everything in the account.
- Deploy through CDK. It can assume the CDK bootstrap roles (`cdk-hnb659fds-*`). CDK is
  already bootstrapped in `us-east-2`; do not run `cdk bootstrap`.
- Test what you deployed: invoke Lambda functions whose names start with `FinanceApp`;
  `PutItem`, `UpdateItem`, `DeleteItem`, and `BatchWriteItem` on DynamoDB tables whose names
  start with `FinanceApp`; and `PutObject` and `DeleteObject` in S3 buckets whose names start
  with `financeapp`.
- Nothing else. It cannot change IAM, create Cognito users, or create resources outside
  CloudFormation. Organizations and account actions are denied.

**What your stacks may contain.** CloudFormation deploys with a restricted policy that
allows Lambda, DynamoDB, S3, CloudFront (including CloudFront Functions), API Gateway,
Cognito user pools, CloudWatch Logs and metrics, reading SSM parameters, and IAM roles
whose names start with `FinanceApp`. Anything else fails to deploy, including VPCs, EC2, NAT
gateways, SQS, SNS, EventBridge, Step Functions, SES, KMS keys, Secrets Manager, WAF,
Route 53, and ACM. Do not use them.

**Naming.** Your stack prefix is `FinanceAppB1`. Name your stacks `FinanceAppB1Data`,
`FinanceAppB1Api`, and `FinanceAppB1Web`. Do not set physical names (`tableName`,
`functionName`, `bucketName`, `roleName`, and similar) on any resource; let CDK generate
them from the stack name. The permissions above depend on resource names starting with
your stack name. Another agent deploys into the same account with a different prefix:
never read, change, or delete any stack or resource that does not start with
`FinanceAppB1`, and never touch the `CDKToolkit` stack.

**Deploying.** Deploy with `npx cdk deploy --all --require-approval never`, with the
variables above in front. If a deployment fails because a service or permission is not
allowed, do not try to work around the restrictions. Record the exact error in
`IMPLEMENTATION_NOTES.md`, change your approach if the design allows it, and otherwise
continue with the rest of the work.

**Configuration already in Parameter Store (`us-east-2`).**

| Parameter | Type | Contents |
|---|---|---|
| `/FinanceApp/bccr/endpoint` | String | BCCR base URL, up to and including `/indicadoresEconomicos` |
| `/FinanceApp/bccr/indicator` | String | The exchange-rate indicator code |
| `/FinanceApp/bccr/token` | SecureString | The BCCR bearer token |

- Give the Lambdas that need them `ssm:GetParameter` and `ssm:GetParameters` on
  `/FinanceApp/bccr/*`, and pass only parameter names to them as environment variables. The
  Lambdas read the values at runtime, with decryption for the token.
**Secrets and cost.** Never put a secret in code, in a file, in an environment variable, or
in a log. The repository is public. Never read, print, log, or store the BCCR token's value,
and test the BCCR client with a mocked HTTP response. Use on-demand and serverless options
only; do not use provisioned capacity.

## Verifying and finishing

1. Run the type checks and unit tests until they pass.
2. Deploy, then verify what you can without a user account:
   - the CloudFront URL loads the app;
   - an `/api/*` request without a token returns `401`;
   - `/ingest/gmail` with an invalid token returns `401`.
3. You cannot create Cognito users. The person running you will sign up through the app to
   test the signed-in flows, so make sure sign-up and sign-in work.
4. Finish by writing `IMPLEMENTATION_NOTES.md` with:
   - what was built for each in-scope user story, and anything left incomplete;
   - the deployed stack names and URLs;
   - which tests ran and their results;
   - every assumption and decision you made;
   - every error you could not resolve, with its exact message.

Then stop.
