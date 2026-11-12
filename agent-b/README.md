# Finance App

A personal USD-based finance application for BAC Credomatic and Banco Nacional accounts. It records manual transactions, imports supported CSV statements, receives Gmail bank alerts through a user-installed Apps Script, categorizes spending, tracks budgets, and values investment holdings.

## Features

- Cognito-protected `/api/*` HTTP API; Gmail ingest routes authenticate a revocable, SHA-256-hashed connection key.
- CSV import templates for BAC `Transacciones del mes` and Banco Nacional `Consulta de saldos`.
- Gmail templates for BAC transaction notifications and Banco Nacional digital vouchers.
- USD rollups with BCCR CRC conversion, original-currency preservation, budgets, review, and broker fee calculations.
- Yahoo Finance market quotes with a 15-minute shared cache. Twelve Data is optional and is never required.
- Next.js server-rendered UI with responsive navigation, empty/loading/error states, and accessible tables.

## Install and validate

```sh
npm install
npm run typecheck
npm test
npm run build
```

The tests run without AWS. They mock HTTP and AWS client boundaries and include golden tests for all four files in `samples/`.

## Local development

```sh
npm run dev
```

The local server binds only to `127.0.0.1`. Set `NEXT_PUBLIC_API_URL` to an API deployment URL when using the UI with AWS. Authentication tokens are expected in secure, HttpOnly `finance_id_token` and `finance_user_id` cookies, created by the Cognito sign-in integration.

## Deploy

Deploy only to the designated AWS account and `us-east-2`:

```sh
AWS_CONFIG_FILE=/Users/keisynf/.finance-aws/config AWS_SHARED_CREDENTIALS_FILE=/Users/keisynf/.finance-aws/credentials AWS_PROFILE=finance-agent AWS_REGION=us-east-2 npx cdk synth
AWS_CONFIG_FILE=/Users/keisynf/.finance-aws/config AWS_SHARED_CREDENTIALS_FILE=/Users/keisynf/.finance-aws/credentials AWS_PROFILE=finance-agent AWS_REGION=us-east-2 npx cdk deploy --all --require-approval never
```

The CDK app creates `FinanceAppB3Data`, `FinanceAppB3Api`, and `FinanceAppB3Web`. DynamoDB uses on-demand capacity, PITR, and retain-on-delete. Raw imports remain private, encrypted, and expire after 30 days. The web stack removes the unsupported cdk-nextjs SSM distribution parameter during synthesis; confirm synthesized templates contain no `AWS::SSM::Parameter` before deployment.

After deployment, use the `WebUrl`, `ApiUrl`, and `UserPoolId` outputs to configure sign-in. The browser gets a Cognito ID token and the Next.js server forwards it to API Gateway as a bearer token. The API gateway rejects missing or expired tokens before the Lambda runs.

## Gmail connection

1. Sign in and choose **Connect Gmail**.
2. Copy the one-time key and `gmail-script/Code.gs` into a new Apps Script project.
3. Add `API_BASE` and `INGEST_TOKEN` in Apps Script Script Properties. Do not put the key in source code.
4. Run `setup()` once and grant Gmail permissions.

The script searches only supported sender addresses, sends raw MIME only over HTTPS, labels mail after a successful response, sends a heartbeat, and removes its trigger after a revoked-key 401 response.

## Supported formats

See `diagrams/bank-formats.md` for source-format rules and golden expectations. Files over 1 MiB are rejected. A repeated import is idempotent by file hash and row fingerprint. A malformed row is reported without preventing valid rows from importing.

## Configuration

Lambdas receive only SSM parameter *names*. They read `/FinanceApp/bccr/endpoint`, `/FinanceApp/bccr/indicator`, and `/FinanceApp/bccr/token` at runtime with decryption. `/FinanceApp/prices/twelvedata-api-key` is optional; without it, quote lookup uses Yahoo Finance alone.
