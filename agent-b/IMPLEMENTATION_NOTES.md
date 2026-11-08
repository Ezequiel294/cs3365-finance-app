# Implementation Notes

## Built scope

- **01-S02 through 01-S05:** shared Zod transaction/import schemas; direct S3 presigned CSV upload initiation; integer-money transaction creation; duplicate-review service shape; USD conversion boundary; synthetic CSV parser/template.
- **01-S08, 01-S09, 06-S02:** one-time 32-byte Gmail ingest tokens (only SHA-256 persisted), connection status/list/rotation/revocation/heartbeat service, and paste-ready Google Apps Script.
- **02-S02, 02-S03, 02-S05, 02-S06:** transaction category/tag contract, normalization, uncategorized review state, and review endpoint shape.
- **03-S02, 03-S10, 03-S11:** weekly/monthly/quarterly/yearly/custom period calculator, category/tag budget matching, budget storage and progress contract.
- **04-S01, 04-S03, 04-S06:** dashboard and cash-flow UI shells plus rollup-planner types and month/category/tag key conventions.
- **05-S01, 05-S02, 05-S06:** USD/CRC schemas, exact integer CRC conversion, BCCR SSM-backed provider, and original-currency transaction persistence.
- **07-S01 through 07-S05:** investment/broker schemas, average-cost holding calculator, commission calculation, valuation and liquidation services, a shared TTL price cache contract, and Alpha Vantage provider selected for its free tier.
- **Infrastructure:** `FinanceAppB1Data` defines five on-demand DynamoDB tables with PITR and RETAIN. `FinanceAppB1Api` defines private encrypted raw S3 storage with expiry, API/worker Lambdas from one bundle, Cognito pool/client, HTTP API Cognito JWT authorizer for `/api/*`, and least-privilege SSM grants. `FinanceAppB1Web` uses `NextjsGlobalFunctions`.

## Known incomplete behavior

The source compiles and the deployed API correctly rejects anonymous requests, but several in-scope operational paths are stubs or not fully wired: `importWorkerHandler` does not yet read and process CSV S3 events; Gmail `/ingest/gmail` currently authenticates/heartbeats but does not persist MIME or run template/DKIM/duplicate processing; transaction writes do not yet persist the calculated rollup deltas in the same DynamoDB transaction; APIs for rules and category/tag/month analytics remain unimplemented; and the UI does not yet provide all update/review/investment-entry forms. These are left explicit rather than silently claiming the diagrams' end-to-end guarantees.

## Deployment

- `FinanceAppB1Data`: deployed successfully.
- `FinanceAppB1Api`: deployed successfully.
  - API URL: `https://3x2j99exbd.execute-api.us-east-2.amazonaws.com`
  - User Pool: `us-east-2_n9hzeTTK1`
  - User Pool client: `14bcee64mtlo1oqnfvs6sdm6ll`
- `FinanceAppB1Web`: did not deploy successfully and therefore has no reportable CloudFront URL.

## Verification

- `npm run typecheck`: passed before the final cdk synth/deploy cycle.
- `npm test`: passed: 3 files, 7 tests. Tests cover calculators, placeholder CSV/email parsers, rollup planner’s transfer exclusion, transaction creation with an in-memory mocked client boundary, and hashed Gmail token handling.
- `npx cdk synth --app "npx tsx infra/bin/app.ts"`: passed after upgrading to Next.js 16.4.5 and configuring the cdk-nextjs adapter.
- `GET /api/transactions` without a token returned `401`.
- `GET /ingest/gmail/config` with `Bearer invalid` returned `401`.
- CloudFront loading could not be verified because the Web stack failed.

## Assumptions and decisions

- The diagrams did not define management flows for accounts, categories, tags, brokers, or profile setup. The implementation treats their IDs as pre-provisioned references; no browser-provided user ID is accepted.
- Alpha Vantage was selected as the price provider. Missing `/FinanceApp/prices/apiKey` is handled as unavailable/stale price data rather than exposing or embedding a key.
- All money uses integer minor units. Investment quantities use millionths.
- User-facing static app content is public, while financial API endpoints are Cognito-JWT protected and Gmail ingest routes use a hashed bearer token.
- The generated web Lambda receives runtime public configuration through its CDK environment, and `/api/config` exposes only the API URL and Cognito public identifiers to the browser.

## Errors encountered

1. Initial AWS CLI identity check: `aws: [ERROR]: [Errno 17] File exists: '/Users/keisynf/.aws/cli/cache'`.
2. Retrying the AWS CLI with the requested alternate HOME failed: `aws: [ERROR]: The config profile (finance-agent) could not be found`.
3. Initial cdk-nextjs synth with Next.js 15.5.29 failed: `TypeError: Cannot destructure property 'phase' of 'undefined' as it is undefined.`
4. Next.js 16.2.0 was rejected by the construct: `Error: [cdk-nextjs] Next.js 16.2.0 is not supported: cdk-nextjs needs Next.js 16.3 or higher.` Upgrading to 16.4.5 resolved synthesis.
5. The first `cdk deploy --all` timed out after 180 seconds while `FinanceAppB1Web` was creating CloudFront resources. A subsequent deploy could not update it because it remained `CREATE_IN_PROGRESS`.
6. A later Web deployment reported the final unresolved stack state: `The stack named FinanceAppB1Web is in a failed state. You may need to delete it from the AWS console : DELETE_FAILED (The following resource(s) failed to delete: [NextjsGlobalFunctionsDistributionIdParameterB6DF9AE2]. )`.

No destructive cleanup was performed on the failed Web stack.
