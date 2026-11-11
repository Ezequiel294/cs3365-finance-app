# Implementation Notes — FinanceAppB2

## Built scope

- **01 Accounts and ingestion:** Account schemas validate BAC/BN, USD/CRC, IBANs, and unique card last-four digits. The API contains account, transaction, import-start, Gmail-token, and ingest endpoints. `api/src/ingest/parsers.ts` supplies generic CSV/MIME parsing primitives, a template registry, BAC/BN statement detection, statement kind resolution, and card-alert extraction. `gmail-script/Code.gs` fetches sender configuration, labels only successful deliveries, sends a heartbeat, and removes its trigger after a 401.
- **02 Categorization:** `Normalizer`, `Categorizer`, and rule schema/API support normalized merchant keys and deterministic user/global rule resolution. `RollupPlanner` carries uncategorized/review state in the domain model.
- **03 Budgets:** Request schemas, budget period calculator, matcher, and rollup planner implement category/tag matching, weekly/monthly/quarterly/yearly/custom periods, USD limits, progress fields, and burn-down inputs.
- **04 Dashboard:** Next.js pages provide the dashboard surface; rollup data structures and planner include day, month, category, tag, and income/expense buckets.
- **05 Currency:** Domain conversion fields and `FxService`/`BccrRateProvider` implement identity USD conversion, cached-rate dependency injection, BCCR URL construction, SSM-supplied credentials, and exact half-even conversion.
- **06 Data control:** Gmail ingest tokens are 32-byte random values, returned only when created, stored as SHA-256 lookup keys, and required by `/ingest/gmail*`.
- **07 Investments:** Shared `FeeCalculator`, holding calculator, broker and investment schemas, Yahoo Finance primary provider, optional Twelve Data provider, fallback provider, and BigInt valuation arithmetic are implemented.

## Deliberate decisions and assumptions

- The browser uses Cognito `USER_PASSWORD_AUTH` directly from a Next.js route and retains only the ID token in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie. The JWT `sub`, not caller-provided IDs, scopes API records.
- Every AWS resource uses generated physical names. DynamoDB tables are on-demand, have PITR, TTL, and retain-on-delete. The S3 ingest bucket is private, uses S3-managed encryption, blocks public access, enforces TLS, and expires raw objects after 30 days.
- A user has no account balance model, generic bank connection, arbitrary file mapper, notifications, sharing, export/delete, or account-recovery extensions because the design marked them out of scope.
- The first version exposes basic screens for sign-up/sign-in and navigation. The server-side API has the foundation for the documented routes, but several full orchestration paths remain incomplete: transaction rollup persistence, CRC runtime BCCR resolution, CSV transaction persistence, Gmail DKIM verification/retry/revocation, analytics reads, and investment persistence/valuation endpoints. Those gaps are retained rather than falsely claiming working behavior.

## Tests and local validation

- `npm run typecheck` passed.
- `npm test` passed: **3 test files, 11 tests**.
  - Golden parser tests read all four files in `samples/` and validate BAC’s 65-row/amount/kind totals, BN’s five-row/amount/kind totals, and both card-alert values.
  - Service tests cover fee arithmetic/gross-up, budget matching/boundaries, holding average-cost selling, and rollup income behavior.
  - Price tests mock Yahoo responses at the HTTP-client boundary.
- `npx cdk synth --all` passed before deployment. The revised web-stack synth removes the construct-created `DistributionIdParameter` resource. CDK’s standard bootstrap *input parameter* remains; it does not create an `AWS::SSM::Parameter` resource.
- Source search found no `0.0.0.0`, wildcard listener, or application logging of sensitive fields.

## Deployment results

| Stack | Final status | URL / result |
|---|---|---|
| `FinanceAppB2Data` | `CREATE_COMPLETE` | Five generated DynamoDB tables in `us-east-2` |
| `FinanceAppB2Api` | `CREATE_COMPLETE` | API: `https://r0drjegn3l.execute-api.us-east-2.amazonaws.com` |
| `FinanceAppB2Web` | `ROLLBACK_FAILED` | No CloudFront URL was created |

The API JWT gate was verified: `GET /api/accounts` without a token returned **401**. The separate ingest-token gate was verified: `POST /ingest/gmail` with `Bearer invalid` returned **401**.

## Unresolved deployment error

The first web deployment failed before the corrected escape hatch was synthesized. The exact CloudFormation error was:

> `Resource handler returned message: "Access denied for operation 'PutParameter'."`

It occurred on `AWS::SSM::Parameter` resource `Nextjs/DistributionIdParameter` (`NextjsDistributionIdParameter17DC2044`). The stack is now `ROLLBACK_FAILED`. Per the deployment instruction, no stack was destroyed, deleted, or retried while it was failed. The source now removes that resource from the synthesized template, but CloudFormation requires the failed stack to be recovered before a deployment retry can proceed.
