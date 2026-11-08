# Finance App B1

A serverless personal-finance application for USD and Costa Rican colón transactions. It includes a Next.js web UI, Cognito sign-up/sign-in, a Cognito JWT-protected HTTP API, DynamoDB storage, direct CSV upload, Gmail Apps Script ingestion, budget calculations, and investment valuation.

## Prerequisites

- Node.js 24
- An AWS account bootstrapped for CDK in `us-east-2`
- The `/FinanceApp/bccr/endpoint`, `/FinanceApp/bccr/indicator`, and `/FinanceApp/bccr/token` parameters
- Optional market-price key at `/FinanceApp/prices/apiKey` (Alpha Vantage). Without it, price results are unavailable or stale by design.

## Install and verify

```sh
npm install
npm run typecheck
npm test
npm run build
```

`npm test` uses `MemoryStore`; it never connects to AWS. The parser fixtures are synthetic and the two `Example Bank (placeholder)` templates in `api/src/templates.ts` are intentionally not production bank integrations.

## Deploy

Use only `us-east-2` and the designated profile:

```sh
AWS_CONFIG_FILE=$HOME/.finance-aws/config AWS_SHARED_CREDENTIALS_FILE=$HOME/.finance-aws/credentials AWS_PROFILE=finance-agent AWS_REGION=us-east-2 npx cdk deploy --all --require-approval never --app "npx tsx infra/bin/app.ts"
```

The stacks are `FinanceAppB1Data`, `FinanceAppB1Api`, and `FinanceAppB1Web`. CDK generates all physical resource names. The raw-ingest bucket is private, encrypted, and expires source files after 30 days. API Gateway requires a Cognito JWT for every `/api/*` route; the Gmail routes independently verify a one-time ingest token whose SHA-256 hash is stored.

## Use

1. Open the `FinanceAppB1Web.CloudFrontUrl` output.
2. Create an account with an email and verify the Cognito confirmation code.
3. Add manual transactions. Amount fields use the selected original currency; USD rollups use integer cents.
4. Create budgets using category and/or tag IDs. A matching tag is sufficient.
5. Create a Gmail connection once. Copy its one-time token into Apps Script project properties as `INGEST_TOKEN`, set `API_URL` to the API output, paste `gmail-script/Code.gs`, and run `setup()`.
6. Upload a CSV whose header matches a template. The browser calculates its SHA-256 and sends it directly to private S3 using a presigned POST.

## Local development

The frontend expects the runtime configuration injected by CDK. For local testing, set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_COGNITO_POOL_ID`, and `NEXT_PUBLIC_COGNITO_CLIENT_ID` before starting `npm run dev -w web`. Bind local development only to the default loopback interface.

## Security and limitations

The browser never receives BCCR or market API keys. Lambda reads parameter names from environment variables and retrieves values from SSM at runtime. API handlers derive user IDs solely from Cognito claims and never accept a user ID in the request body. Avoid logging monetary amounts, merchant information, accounts, raw MIME, and plaintext ingest tokens.

See `IMPLEMENTATION_NOTES.md` for the deployment outcome and known incomplete flows.
