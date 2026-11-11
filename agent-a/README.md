# Finance App (CS3365 project, agent A, iteration 2)

A personal finance app for Costa Rica: colones and dollars, BAC Credomatic and Banco
Nacional statements and card alerts, budgets, a spending dashboard, and investments with
broker fees. Built from the design in [`diagrams/`](diagrams/); what was built and every
decision taken is in [`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md).

## Layout

| Path | What it is |
|---|---|
| `shared/` | Zod request schemas, domain types, `FeeCalculator`, money helpers. Used by the web app and the API. |
| `api/` | One code bundle with two Lambda entry points: `apiHandler` (ApiFn, Powertools router) and `importWorkerHandler` (ImportWorkerFn, S3 events). Routers → services → repositories, `keys.ts`, `ServiceFactory`. |
| `api/src/ingest/` | Bank template registry, generic CSV and email parsers, the four templates (`templates/`), `IngestPipeline`. |
| `web/` | Next.js 16 app (App Router, Server Actions). Deployed with `cdk-nextjs` `NextjsGlobalFunctions`. |
| `infra/` | AWS CDK app (TypeScript): `FinanceAppA2Data`, `FinanceAppA2Api`, `FinanceAppA2Web`. |
| `gmail-script/Code.gs` | The Google Apps Script users paste into their own Google account. |
| `samples/` | Redacted bank files used by the golden tests. |

## Install

Node.js 24. The npm registry must be the public one; every workspace has an `.npmrc` with
`registry=https://registry.npmjs.org/`.

```sh
npm install
```

## Test

```sh
npm run typecheck   # tsc for shared, api, infra, and web
npm test            # vitest: unit tests and golden tests for every file in samples/
```

Tests need no AWS access: DynamoDB, SSM, and HTTP calls are mocked at the client boundary
(`aws-sdk-client-mock`, injected `fetch`). The golden tests (`api/test/ingest/golden.test.ts`)
run each sample through its parser and assert the results in `diagrams/bank-formats.md`.

## Deploy

Region `us-east-2` only. With credentials for the target account in the environment:

```sh
cd infra
npx cdk deploy --all --require-approval never
```

Synth runs `next build` for the web app, so it takes a minute; a first deploy of the web
stack takes 10 to 20 minutes because of CloudFront. Stack names start with the context
value `prefix` (default `FinanceAppA2`; use `-c prefix=FinanceAppX` for another copy).

Before deploying, these SSM parameters must exist in `us-east-2`:

| Parameter | Type |
|---|---|
| `/FinanceApp/bccr/endpoint` | String, BCCR base URL up to `/indicadoresEconomicos` |
| `/FinanceApp/bccr/indicator` | String, exchange-rate indicator code |
| `/FinanceApp/bccr/token` | SecureString, BCCR bearer token |
| `/FinanceApp/prices/twelvedata-api-key` | optional SecureString; without it only Yahoo Finance is used |

The Lambdas get only the parameter names and read the values at runtime.

Outputs: `FinanceAppA2Web.AppUrl` is the app (a `*.cloudfront.net` URL);
`FinanceAppA2Api.ApiUrl` is the API that the Gmail script calls.

## Local development

```sh
cd web
API_URL=<FinanceAppA2Api.ApiUrl> COGNITO_CLIENT_ID=<FinanceAppA2Api.UserPoolClientId> COGNITO_REGION=us-east-2 npx next dev
```

The raw-ingest bucket allows statement uploads from `http://localhost:3000`.

## Use

1. **Sign up** at the app URL with an email and password, enter the code Cognito emails you,
   then sign in.
2. **Accounts**: register each bank account with its bank, currency, IBAN (optional), and
   the last four digits of its cards. The IBAN lets statement transfers to your own accounts
   be recognized; the cards route alert emails.
3. **Import**: pick the account and a BAC "Transacciones del mes" or Banco Nacional
   "Consulta de saldos" CSV (up to 1 MiB). The summary shows imported, transfers, merged,
   skipped, unreadable rows, and whether the totals match the bank's.
4. **Transactions**: add a purchase or "Money in" by hand; set category, tags, and kind on
   any transaction; accept "Always file … as …?" to save a rule. Amounts show the original
   currency first, then USD at the BCCR rate and its date.
5. **Review**: categorize what no rule settled, merge or dismiss possible duplicates, and
   retry emails that were not understood (for example after adding a card).
6. **Budgets**: per category and/or tags, weekly to yearly or custom dates, with progress
   above 100% and a burn-down chart.
7. **Dashboard** and **Money in and out**: where a month's money went by category or tag,
   and income against spending per month.
8. **Portfolio**: describe a broker's fees, record deposits, buys, sells, and withdrawals
   with suggested commissions, see holdings at market prices (Yahoo Finance), and what
   selling everything would bring home.
9. **Connections → Connect Gmail**: copy the token (shown once) and the script. In
   [script.google.com](https://script.google.com) create a project, paste the script into
   `Code.gs`, add the Script property `INGEST_TOKEN`, and run `setup`. Every 5 minutes it
   forwards BAC and Banco Nacional card alerts. Revoke it on the same page at any time.
