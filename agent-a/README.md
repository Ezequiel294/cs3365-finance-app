# Finance App

A personal finance app for Costa Rican bank customers: BAC Credomatic and Banco Nacional
statements and card alert emails come in, every amount is kept in its own currency and
converted to USD at the BCCR rate, and the dashboard, budgets, and portfolio read
precomputed totals.

The design lives in [`diagrams/`](diagrams/) (architecture, context, class diagram, bank
formats, and one sequence file per module). Decisions made while building it are in
[`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md).

## What is in this folder

| Path | Contents |
|---|---|
| `app/` | Next.js 16 app: pages, Server Actions, UI kit (`app/ui/`), SVG charts (`app/ui/charts/`) |
| `shared/` | Zod schemas, types, `FeeCalculator`, money and date helpers used by the app and the API |
| `api/` | `ApiFn` and `ImportWorkerFn` source (one bundle), tests, and `build.mjs` |
| `infra/` | AWS CDK app with the `FinanceAppA3Data`, `FinanceAppA3Api`, and `FinanceAppA3Web` stacks |
| `gmail-script/Code.gs` | The Apps Script that forwards bank alert emails from your Gmail |
| `samples/` | Redacted bank files used by the golden tests |
| `scripts/` | Smoke-test and local-development helpers |

## Install

Requires Node.js 24. The project `.npmrc` points npm at the public registry.

```sh
npm install
```

## Test

```sh
npm run typecheck   # app, API, and CDK app
npm test            # Vitest: services, calculators, parsers, rollup planner, charts, golden samples
```

Tests need no AWS access: DynamoDB clients are mocked with `aws-sdk-client-mock` and HTTP
calls (BCCR, Yahoo Finance, Twelve Data) are mocked at `fetch`. The golden tests in
`api/test/golden/` run every file in `samples/` through its template and check the results
listed in `diagrams/bank-formats.md`.

## Deploy

The stacks deploy to `us-east-2`. CDK must already be bootstrapped there.

```sh
cd infra
npx cdk synth          # builds the API bundle and runs `next build`
npx cdk deploy --all --require-approval never
```

Use your AWS credentials as environment variables in front of each command (for example
`AWS_PROFILE=... AWS_REGION=us-east-2 npx cdk deploy --all ...`). The first deploy of the
web stack takes 10 to 20 minutes because of CloudFront. The outputs are:

| Output | Use |
|---|---|
| `FinanceAppA3Web.AppUrl` | The app, `https://<id>.cloudfront.net` |
| `FinanceAppA3Api.ApiUrl` | The HTTP API; the Gmail script calls `<ApiUrl>/ingest/gmail` |
| `FinanceAppA3Api.UserPoolId`, `UserPoolClientId` | Cognito, for local development |

Configuration read at runtime from SSM Parameter Store (create these before using CRC):

| Parameter | Type | Contents |
|---|---|---|
| `/FinanceApp/bccr/endpoint` | String | BCCR base URL, up to and including `/indicadoresEconomicos` |
| `/FinanceApp/bccr/indicator` | String | The exchange-rate indicator code |
| `/FinanceApp/bccr/token` | SecureString | The BCCR bearer token |
| `/FinanceApp/prices/twelvedata-api-key` | SecureString | Optional. Enables Twelve Data as a price fallback |

The Lambdas get only the parameter names. Without the Twelve Data key, prices come from the
Yahoo Finance chart API alone.

## Use

1. Open the `AppUrl`, choose **Create an account**, and confirm your email with the code
   Cognito sends.
2. **More → Accounts → Add an account.** Add each bank account with its bank, currency, IBAN
   (lets transfers between your own accounts be recognized), and the last four digits of its
   cards (routes alert emails).
3. **More → Import a statement.** Choose the account and the CSV you downloaded
   (BAC "Transacciones del mes" or BN "Consulta de saldos"). The result shows how many rows
   were imported, how many were transfers between your accounts, and whether the totals
   match the ones the bank printed.
4. **Review** files what no rule settled. Choosing a category files the row at once and
   offers to always file that merchant the same way.
5. **Budgets → New budget** sets a weekly, monthly, quarterly, yearly, or custom limit for
   categories and/or tags. **More → Settings** holds the week-start day, the time zone, and
   your own categories and tags.
6. **Portfolio → Brokers and fees → Add a broker**, then **Record a transaction** for each
   deposit, buy, sell, and withdrawal. The fee is suggested from the broker's schedule.
7. **More → Connections → Connect Gmail** shows a key once and the script. In
   [script.google.com](https://script.google.com) create a project, paste the script into
   `Code.gs`, add the script property `INGEST_TOKEN` with the key, and run `setup`. Every 5
   minutes the script forwards new BAC and BN alert emails and sends a heartbeat.
   **Disconnect** revokes the key immediately.

## Local development

The app can run locally against the deployed API:

```sh
API_URL=<ApiUrl> COGNITO_CLIENT_ID=<UserPoolClientId> COGNITO_REGION=us-east-2 \
  npx next dev -H 127.0.0.1 -p 3000
```

`http://localhost:3000` is allowed by the raw-ingest bucket's CORS rule, so statement uploads
work from the dev server.

`scripts/local-api.mjs` serves the API bundle on `127.0.0.1:4000` for debugging without API
Gateway. It does **not** verify tokens, so it refuses to start unless
`LOCAL_API_UNVERIFIED_TOKENS=1` is set; it needs the table and bucket names as environment
variables (see `api/src/config.ts`) and `npm run build:api` first. Never expose it.

## Smoke testing a deployment

```sh
curl -i <ApiUrl>/api/catalog                       # 401 from the JWT authorizer
scripts/smoke-invoke.sh <ApiFnName> GET /api/catalog   # invokes ApiFn directly with a test user
```

`scripts/smoke-invoke.sh` builds an API Gateway event with a synthetic Cognito `sub` and
invokes the function with the AWS CLI. Edit the credential variables at its top for your
environment.
