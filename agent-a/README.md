# Finance App

A personal finance app for people who bank in Costa Rica: transactions arrive by hand, from
downloaded bank statements (CSV), and from bank alert emails sent by a Gmail Apps Script that runs
in the user's own Google account. Everything is totalled in USD, with colón amounts converted at the
official BCCR rate of each transaction's date. It also tracks budgets and investment holdings.

The design lives in [`diagrams/`](diagrams/) (architecture, context, class diagram, and one
sequence diagram file per module). The original product requirements are in
[`one-pagers/`](one-pagers/). What was built, and every decision taken along the way, is in
[`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md).

## Layout

| Path | What it is |
|---|---|
| `shared/` | Zod request schemas, domain types, and money helpers used by both the web app and the API |
| `api/` | One code bundle with two Lambda entry points: `ApiFn` (`apiHandler`) and `ImportWorkerFn` (`importWorkerHandler`). Routers, services, repositories, `keys.ts`, bank templates |
| `api/src/ingest/templates/` | The bank template registry. **Both templates are placeholders** (`example-bank-*`) until real, redacted bank samples exist |
| `web/` | The Next.js 16 app (App Router, Server Actions), deployed with `cdk-nextjs` |
| `infra/` | AWS CDK app (TypeScript): `FinanceAppA1Data`, `FinanceAppA1Api`, `FinanceAppA1Web` |
| `gmail-script/Code.gs` | The Gmail Apps Script users paste into their own Google account |

## Requirements

- Node.js 24 and npm 11.
- For deploying: an AWS account with CDK bootstrapped in `us-east-2`. No Docker is needed: the
  Lambdas are bundled with the local `esbuild`, and `cdk-nextjs` builds the Next.js app locally.

## Install

The repository ships an `.npmrc` that points npm at the public registry.

```sh
npm install
```

## Test

```sh
npm run typecheck   # tsc in every workspace
npm test            # vitest in every workspace
```

The tests never call AWS. The DynamoDB, S3, and SSM clients are replaced at the client boundary
with `aws-sdk-client-mock` (DynamoDB by a small in-memory fake in `api/test/support/fake-dynamo.ts`),
and the BCCR, price-feed, and DKIM DNS calls are faked. Run one workspace with, for example,
`npm test -w @finance/api`.

## Run the web app locally

The web app needs a deployed API and user pool. Create `web/.env.local`:

```sh
API_URL=https://<api-id>.execute-api.us-east-2.amazonaws.com
COGNITO_CLIENT_ID=<UserPoolClientId output of FinanceAppA1Api>
COGNITO_REGION=us-east-2
```

Then `npm run dev -w @finance/web` and open http://localhost:3000. CSV uploads from localhost work
because the raw-ingest bucket allows `http://localhost:3000` in its CORS rules.

## Deploy

```sh
cd infra
npx cdk deploy --all --require-approval never
```

Set the AWS profile and region for your account first (`AWS_PROFILE=...`, `AWS_REGION=us-east-2`).
The stack prefix is the `prefix` context value in `infra/cdk.json` (`FinanceAppA1`); pass
`-c prefix=SomethingElse` to deploy a second copy. The deploy prints:

- `FinanceAppA1Web.AppUrl`: the CloudFront URL of the app.
- `FinanceAppA1Api.ApiUrl`: the HTTP API. The Gmail script talks to it directly.

### Smoke test after a deploy

`scripts/smoke-test.mjs` checks a deployment without a Cognito user. It invokes the deployed
`ApiFn` directly with events that carry a synthetic user ID (direct Lambda invocation skips API
Gateway's authorizer), exercises manual entry with a live BCCR rate, analytics, budgets,
investments, the Gmail token lifecycle through the real HTTP API, and a CSV import through S3 and
`ImportWorkerFn`, then deletes everything the synthetic user created. It prints no tokens.

```sh
node scripts/smoke-test.mjs <ApiFunctionName output> <ApiUrl output>
```

### Configuration in SSM Parameter Store (us-east-2)

The Lambdas receive only parameter *names* and read the values at runtime.

| Parameter | Type | Used for |
|---|---|---|
| `/FinanceApp/bccr/endpoint` | String | BCCR SDDE base URL up to `/indicadoresEconomicos` |
| `/FinanceApp/bccr/indicator` | String | Exchange-rate indicator code |
| `/FinanceApp/bccr/token` | SecureString | BCCR bearer token |
| `/FinanceApp/prices/apiKey` | SecureString | [Twelve Data](https://twelvedata.com/pricing) API key (free Basic plan). **Optional**: while it is missing, holdings show "price unavailable" |

To enable market prices, create a free Twelve Data key and store it:

```sh
aws ssm put-parameter --region us-east-2 --name /FinanceApp/prices/apiKey --type SecureString --value '<key>'
```

The API picks it up within 5 minutes; no redeploy is needed.

## Use

1. Open the `AppUrl`, choose **Create account**, and confirm the code Cognito emails you.
2. In **Settings**, add your accounts (bank, currency, and the last 4 digits that appear in bank
   emails), and any categories or tags of your own next to the global ones.
3. **Transactions**: add purchases or money in by hand. The currency defaults to the account's and
   the date to today. Colón amounts show the USD figure, the BCCR rate, and its date. Change a
   category or tags in place; after a correction the app offers to remember it for the merchant.
4. **Import statement**: pick the account and a CSV. The file goes straight to S3; the import
   summary lists every unreadable row and why. Only the placeholder "Example Bank" layout is
   recognised until real bank templates are added.
5. **Connections → Connect Gmail**: copy the one-time token and the script. In
   [script.google.com](https://script.google.com) create a project, paste the script into
   `Code.gs`, add the token as the script property `INGEST_TOKEN`, and run `setup()`. Every 5
   minutes the script sends new emails from supported bank senders and a heartbeat. If no heartbeat
   arrives for 24 hours the dashboard shows a "stopped" banner with a reconnect button. **Revoke**
   stops the script on its next call.
6. **Review**: uncategorized transactions, possible duplicates (merge or keep both), and bank
   emails no template could read.
7. **Budgets**: limits per category and/or tags, weekly to yearly or custom dates, with history
   backfilled from past transactions, the proportion used (above 100% when over), and a burn-down.
8. **Dashboard** (by category or tag) and **Money in and out** (12 months of income against
   spending) read precomputed totals.
9. **Portfolio**: add a broker and its commission rule, record deposits, buys, sells, and
   withdrawals with the commission actually charged, see holdings at market prices and what selling
   everything would return after commissions.

## Adding a real bank template

1. Collect a real alert email or statement and redact it.
2. Add a template object next to `api/src/ingest/templates/example-bank-*.ts` and list it in
   `templates/index.ts`. Templates are declarative: sender and subject, regex field patterns, or
   the CSV header row, delimiter, encoding, number and date formats, and column names.
3. Add the redacted sample under `api/test/fixtures/` and a golden test like the ones in
   `api/test/parsers.test.ts`.
4. Run `npm test`, then redeploy. The Gmail script picks up new senders within 6 hours (or rerun
   `setup()`).

If you edit `gmail-script/Code.gs`, run `npm run embed-script -w @finance/api` so the API hands
out the new version; a unit test fails while the two differ.
