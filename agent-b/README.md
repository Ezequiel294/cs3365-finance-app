# Finance App B2

A private personal-finance application for BAC Credomatic and Banco Nacional accounts. It supports manual transactions, fixed bank-statement templates, a revocable Gmail Apps Script connection, categories and tags, USD budget rollups, and fee-aware investment records. The API accepts Cognito ID tokens and derives the user identity from the JWT subject.

## Prerequisites

- Node.js 24+
- AWS CDK credentials for the target account and `us-east-2`
- An AWS account bootstrapped for CDK

## Install and validate

```sh
npm install --registry=https://registry.npmjs.org/
npm run typecheck
npm test
```

The parser golden tests read all files in `samples/` and assert the bank-format results. Unit tests are pure and do not contact AWS.

## Deploy

This project uses `FinanceAppB2Data`, `FinanceAppB2Api`, and `FinanceAppB2Web`. Supply your AWS profile through environment variables, then run:

```sh
AWS_CONFIG_FILE=/path/to/config AWS_SHARED_CREDENTIALS_FILE=/path/to/credentials AWS_PROFILE=finance-agent AWS_REGION=us-east-2 npx cdk deploy --all --require-approval never
```

CDK prints the CloudFront URL, API URL, Cognito user-pool ID, and app client ID. The web app lets a user sign up or sign in with Cognito. API calls must send the ID token as `Authorization: Bearer <token>`.

## Gmail connection

After signing in, create a Gmail connection. Copy `gmail-script/Code.gs` to Google Apps Script. In its Script Properties set `API_BASE` to the API URL and `INGEST_TOKEN` to the value shown once by the connection endpoint, then run `setup()`. It creates a five-minute trigger. The script reads only messages from BAC and BN alert addresses and labels successful deliveries `financeapp-processed`. Revoking the connection invalidates the token immediately.

## Data and security

The five DynamoDB tables use on-demand billing, point-in-time recovery, TTL, and retain-on-delete. The raw-ingest S3 bucket is private, encrypted by S3-managed encryption, blocks public access, expires raw files after 30 days, and accepts CSV upload posts limited to 1 MiB. The API Gateway HTTP API protects `/api/*` using a Cognito JWT authorizer; only `/ingest/gmail*` uses a separate hashed, revocable ingest token. No bank credentials, Gmail credentials, tokens, raw email content, account numbers, merchants, or transaction amounts are logged.
