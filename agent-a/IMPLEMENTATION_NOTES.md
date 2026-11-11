# Implementation notes — agent A, iteration 2

Built in one session from `diagrams/`, `samples/`, and `one-pagers/`. Everything is in
this directory: `shared/`, `api/`, `web/`, `infra/`, `gmail-script/`, `scripts/`.

## Deployed

| Stack | Final status |
|---|---|
| `FinanceAppA2Data` | `CREATE_COMPLETE` |
| `FinanceAppA2Api` | `CREATE_COMPLETE` |
| `FinanceAppA2Web` | `UPDATE_COMPLETE` (created, then updated once to add the investment-correction UI) |

- App (CloudFront): **https://d3o67i9lghbxl7.cloudfront.net**
- API (HTTP API, used by the Gmail script): **https://heg25euoo2.execute-api.us-east-2.amazonaws.com**
- Cognito user pool `us-east-2_VYYW8IZgW`, app client `6hj505om3drsa5aasuu5anqjc7` (public client, no secret)
- Raw-ingest bucket `financeappa2api-rawingest26c2413e-vg0liq307isr`
- Functions `FinanceAppA2Api-ApiFnE0725F78-0FpgfMuuI1dk`, `FinanceAppA2Api-ImportWorkerFn412FE6FF-PVORXps5lCCN`

No physical names are set on any resource; every generated name starts with the stack name.

## What was built, per in-scope story

| Story | Built |
|---|---|
| 01-S02a Register an account | `/accounts` page, `POST/GET/PATCH /api/accounts`, `AccountService` with the one-card-one-account check, IBAN and card validation in the shared Zod schema. |
| 01-S02 Import a statement | `/import` page: SHA-256 in the browser, 1 MiB limit, presigned POST straight to S3 (key and size bound, 5 min), S3 event → `ImportWorkerFn` → `IngestPipeline.processCsv`; `FILE#` claim (reclaimable when `FAILED`), `ROWFP#` claim in the same `TransactWriteItems` as the row, row errors with line numbers, checksum against the bank's printed totals, polling every 2 s and a summary. |
| 01-S03 Add a transaction by hand | `/transactions` form (date defaults to today, currency to the account's), `TransactionService.create`. |
| 01-S04 Review possible duplicates | Exact email/statement matches merge automatically; near matches are saved with `possibleDuplicateOf` and shown in `/review` with Merge / Keep both. |
| 01-S05 Record incoming money | "Money in" tab on the transaction form; income goes to `incomeCents` only. |
| 01-S08 Gmail connection (a, b, c) | `/connections` (token shown once + script), `ConnectionService` (hashed token, `TOKEN#`), `/ingest/gmail`, `/config`, `/heartbeat`, `processEmail` with sender allowlist, template match, DKIM check (`mailauth`), card routing, unparsed reasons, and Retry in the review inbox. `gmail-script/Code.gs`. |
| 01-S09 Stale connection | Stale after 24 h without a heartbeat; banner on the dashboard and the Connections page, Reconnect rotates the token. |
| 02-S02 Category and tags | Per-row category, kind, and tag editor; moves amounts between rollups in one transaction with a version check and one retry. |
| 02-S03 Automatic categorization | `Normalizer` + `Categorizer` (user rule, then global rule, else review inbox). Global categories and a few global rules are seeded by the data stack. |
| 02-S05 Correction remembered | After an edit the row asks "Always file … as …?"; `PUT /api/rules/{merchantKey}` with optional `kind`. |
| 02-S06 Review inbox | `/review`: uncategorized (sparse `review` GSI), duplicates, unparsed emails, and the count; rows leave as they are categorized. |
| 03-S02 Budget per category/tags | `/budgets`, `BudgetService.create` with backfill of the current and 11 earlier periods. |
| 03-S10 Period change | Edit period/filters → rebuild of `P#`/`D#` items; week start setting (Monday by default). |
| 03-S11 Proportion used | Percent without upper bound, amount over in words and number, burn-down chart with the even-pace line. |
| 04-S01 Where last month's money went | `/dashboard` (defaults to last month), ranked bars, Uncategorized kept as a row. |
| 04-S03 By tag and category | Category/Tag toggle, budget limit next to tags with a budget, overlap note. |
| 04-S06 Income alongside spending | `/cashflow`: 12 months, two series, months without data shown as $0. |
| 05-S01 Original currency shown | Every row shows the original amount first, then USD, rate, and rate date. |
| 05-S02 BCCR rate | `FxService` + `BccrRateProvider` (SSM once per container, bearer header, `datos[0].series`, 7-day fallback, `FX#` cache, half-even exact integer conversion, 503 when no rate). Verified live: 14,000 CRC on 2026-11-09 → $30.96 at 452.13. |
| 05-S06 Import keeps its currency | BAC currency from the preamble (mismatch fails the file), BN from the account; original amounts kept. |
| 06-S02 See and revoke | Connections page shows status, token prefix, last seen, 7-day delivery counts, and Revoke (deletes `TOKEN#`, next call is 401). |
| 07-S01 Record a holding | Buy tab with Yahoo quote on ticker blur (name, type, price, asset class, gross = units × price); holding ADD in the same transaction; corrections replay all trades of the ticker. |
| 07-S02 Value at market prices | `PriceClient` (`PRICE#` cache, fresh 15 min, TTL 30 days, max 4 parallel refreshes, NOT_FOUND retried hourly, FX pairs for non-USD quotes, BigInt valuation); stale age and missing-price reasons on the page. |
| 07-S03 Broker fees | `BrokerFeesForm` with six rows × (flat USD, %); create and versioned update. |
| 07-S04 Contribution with fees | Deposit tab with "amount sent" or "amount that arrived" (gross-up), live suggestion from the shared `FeeCalculator`, user override sends `commissionCents`, per-type success messages cleared on tab change. |
| 07-S05 Value if sold today | Per broker: sell fee per holding, cash, withdrawal fee once on positive proceeds, net to bank, negative-cash warning, explanations for every deduction. |

Out-of-scope stories (backlog list in `diagrams/sequences/README.md`) were not built.

### Incomplete or limited

- **Sign-up/sign-in with a real user was not run end to end**: the role cannot create Cognito
  users. Verified instead: the sign-in Server Action runs through CloudFront and returns
  "Wrong email or password." from Cognito for an unknown user, so the Next.js server reaches
  Cognito with the right client. Sign-up sends a code by Cognito's default email (limit about
  50 emails a day on that sender).
- **DKIM**: the redacted samples' signatures no longer verify (stated in `samples/README.md`),
  so posting them to the live API gives `rejected: DKIM_FAILED`. Real bank emails are needed
  to see a Gmail import end to end; the parsing path is covered by the golden and pipeline tests.
- **Investment corrections** change amount, units, gross value, and commission, not the date
  or the ticker. When a correction replays a holding, only the corrected sale's stored
  realized gain is rewritten; the difference in total realized gain is added to the corrected
  trade's month rollup.
- Accounts: bank and currency cannot be edited after creation (the design allows it until the
  first transaction exists; there is no cheap way to know that without an index).

## Tests that ran

| What | Result |
|---|---|
| `npm run typecheck` (tsc for `shared`, `api`, `infra`, `web`) | pass |
| `npm test` (vitest, 17 files) | **153 passed, 0 failed** |
| Golden tests `api/test/ingest/golden.test.ts` | all 4 samples: BAC 65 rows (61 out $2,032.43 / 4 in $1,913.67, checksum ok, 58 transfers, 2 payment_sent, 2 sinpe_sent, 1 purchase, 1 sinpe_received, 1 income, 8 rows field by field); BN 5 rows (2 out $1,304.65 / 3 in $1,305.00, 3 rows field by field); both emails field by field and routed by card |
| `next build` | pass (15 routes) |
| `cdk synth` | pass; no `AWS::SSM::Parameter` resource (only the bootstrap-version template parameter, which reads SSM) |

Unit tests cover: FeeCalculator, money and schemas, RollupPlanner, PeriodCalculator,
BudgetMatcher, Normalizer, TransactionService (DynamoDB client mocked), BudgetService,
BudgetAnalyticsService, SpendingAnalyticsService, FxService and BccrRateProvider (SSM client
and HTTP mocked, fake token), Yahoo/Twelve Data/Fallback providers and PriceClient (HTTP
mocked), HoldingCalculator, InvestmentService, ValuationService, ConnectionService,
AccountService, all parsers, DkimVerifier (stub), IngestPipeline (CSV and email, with fakes),
and the ApiHandler (401, 400, 404 mapping).

Live checks after deploying (all passed):

- `GET /` → 307 to `/login`; `/login` and `/signup` 200; static assets 200 through CloudFront.
- `GET /api/accounts` without a token → **401** `{"message":"Unauthorized"}`; with a garbage token → 401.
- `POST /ingest/gmail` with an invalid token → **401** `{"code":"UNAUTHORIZED","message":"Invalid ingest token"}`; `/config` and `/heartbeat` the same.
- Through a direct `ApiFn` invoke with a synthetic user (`scripts/invoke-api.mjs`): accounts, a CRC
  transaction converted with the live BCCR rate and filed by a global rule, Yahoo quotes (VT found,
  unknown ticker 404), statement import via presigned POST (S3 answered with
  `Access-Control-Allow-Origin` for the CloudFront domain) → worker → `DONE`, 65 imported,
  58 transfers, checksum ok; re-upload → 409 with the previous import id; analytics, budget
  backfill (155%, over the limit), Gmail connection create → config 200 → ingest → revoke → 401;
  broker, deposit, buys, valuation, liquidation (negative cash flagged).
- The synthetic user's data was deleted afterwards with `scripts/delete-user-data.mjs`.

## Assumptions and decisions

**Data and keys**
- Transaction and investment ids are `yyyymmdd-<uuid>`, so `get(userId, id)` can rebuild the
  `TXN#<date>#<id>` / `INV#<date>#<id>` sort key without an extra index. Dates of stored
  transactions cannot be edited.
- Global items (`FX#…`, `PRICE#…`, `TOKEN#…`) use `SK = "#"`.
- The `review` GSI key is `reviewPK = USER#id`, `reviewSK = <DUPLICATE|UNCATEGORIZED>#<date>#<id>`;
  a possible duplicate takes priority over uncategorized.
- Uncategorized spending is rolled up under `MONTH#…#CAT#uncategorized`.
- Transfers and card payments do not need a category: they are saved `confirmed` and never
  enter the review inbox (58 BAC transfers would otherwise flood it).
- Budget period items hold `spentCents` (from the planner's `expenseCents`); `count` is the
  number of transactions. A refund counts −amount.
- Holding value is `quantityMicro × priceMicros ÷ 10¹⁰` cents (the class diagram's "÷ 10¹²" gives dollars).

**Ingestion**
- Duplicate matching: same account, same currency, same day, a *different* source.
  Exact = same amount (merged; prefers a matching reference). Near = amount within 10%
  (flagged). Two identical rows from the same statement stay separate.
- Exact merges keep the stored transaction, add the source, take the alert's merchant text
  and time, and never replace a user-set category. A merged email's `MSG#` status is
  `duplicate`, which is what the Connections page counts as "already known".
- When saving an email fails (for example no exchange rate), the `MSG#` claim is deleted and
  the API answers 5xx, so the script sends it again. "Not understood" and "rejected" are kept.
- Rows that fail for a retryable reason (no rate, write error) are not claimed and the
  `FILE#` claim is set to `FAILED`, so the same file can be uploaded again (the job itself is
  `DONE` with row errors). An upload claim that never received a file is reclaimable after 10 minutes.
- The checksum compares the totals of every row that parsed (imported, merged, or skipped),
  so a re-import still reports whether the file was read correctly.
- Raw email keys are `raw/<userId>/<sha256(Message-ID)>.eml`; without a Message-ID the email's
  hash is used. Raw emails and `MSG#` items are kept 180 days, uploaded CSVs 30 days.
- The Gmail script searches `from:(…) {-label:financeapp-processed newer_than:2d}` and keeps
  the ids of accepted messages in Script Properties: Gmail labels whole threads, and BN
  alerts all share the subject "Voucher Digital", so a new alert can join a labelled thread.
  A thread is labelled only after all its messages got a 2xx. The server ignores repeats.
- `Normalizer` drops digits, punctuation, a list of Costa Rican place names and company
  suffixes, keeps up to four words joined with `-` (`AUTOMERCADO ESCAZU 042` → `automercado`,
  `DTR:inversiones_hapi_VT` → `dtr-inversiones-hapi-vt`).

**API and UI**
- Added routes not in the route table, needed by the stories: `GET/POST /api/categories`,
  `GET/POST /api/tags`, `GET/PUT /api/settings` (week start, time zone), `GET /api/budgets`.
- Global categories (17) and 8 global merchant rules are seeded by a custom resource in
  `FinanceAppA2Data`; users can add their own categories and tags.
- Sign-in uses Cognito `USER_PASSWORD_AUTH` from the Next.js server (no hosted UI); tokens are
  in `HttpOnly`, `SameSite=Strict`, `Secure` cookies. Pages that find an expired ID token go
  through `/auth/refresh`, because a page render cannot set cookies.
- Server Actions return `{ok, data | error}`; pages call `router.refresh()` after a change
  instead of `revalidatePath` (which would need the removed distribution-id parameter).
- Rule kinds apply to statement rows and emails; a manual entry keeps the kind the user picked.
- If no rule matches, a manual entry still goes to the review inbox unless the user picked a category.
- Correcting a trade whose commission came from the fee schedule re-derives it with the
  broker's current fees; a typed commission is kept.
- The FX rate for today or a later date is not cached when BCCR returned an earlier day's rate,
  so the published rate is used once it exists.

**Infrastructure**
- Cognito lives in the API stack (the JWT authorizer needs it), `FeaturePlan.LITE`, Cognito's
  default email sender, self sign-up with email code.
- The raw-ingest bucket's CORS rule is set by a custom resource in the web stack
  (`S3:PutBucketCors`), because the CloudFront domain only exists once the web stack creates
  it and the web stack already depends on the API stack. The bucket's template has no CORS
  property, so API-stack updates do not overwrite it.
- `NextjsGlobalFunctions`: removed `DistributionIdParameter`, the `InvalidationPolicy` that
  reads it, and the `CDK_NEXTJS_DISTRIBUTION_ID_PARAM_NAME` variable (escape hatches in
  `infra/lib/web-stack.ts`). The app does not use on-demand revalidation.
- Lambdas: Node.js 24 on arm64, one esbuild bundle (`api/src/index.ts`, CJS, `.gs` loaded as
  text) with two handlers; log groups with 1-month retention; HTTP API default-stage throttling
  50 rps / burst 100. SSM access is `ssm:GetParameter(s)` on `/FinanceApp/bccr/*` and
  `/FinanceApp/prices/*` plus `kms:Decrypt` only via SSM. `GetParametersByPath` is not used.
- Tables: `TableV2`, on-demand, PITR, `RETAIN`, deletion protection on; TTL attribute `ttl` on
  `Aggregates` and `Ingestion`.
- The Twelve Data key parameter does not exist, so `ServiceFactory` only uses Yahoo; the
  fallback provider is added lazily if the parameter appears.

## Problems met (all resolved)

- `cdk synth` first failed with `Error: Cannot find module 'debug'` from
  `cdk-nextjs/lib/nextjs-build/nextjs-build.js`: cdk-nextjs 0.7.20 declares no dependencies.
  Fixed by adding `debug` and `@next/routing@16.4.6` to `web/package.json`.
- Vitest's default `forks` pool hung with `[vitest-pool]: Timeout terminating forks worker`
  in this sandbox; `vitest.config.ts` uses `pool: 'threads'`.
- The first `cdk deploy` was started as a tool background job and was stopped by the tool
  after the API stack finished (`FinanceAppA2Api` reached `CREATE_COMPLETE` server-side; the
  web stack had not started). It was rerun detached with `nohup` and completed.
- A Server Action posted without JavaScript (plain form POST) gets
  `403 InvalidSignatureException` from the Lambda function URL behind CloudFront OAC, which
  needs an `x-amz-content-sha256` header on POST bodies. cdk-nextjs patches the client bundle
  to send it (confirmed in the deployed `turbopack-*.js` chunk), and the same request with the
  header returned 200. Browsers with JavaScript work; forms do not work with JavaScript disabled.
- npm prints `ignoring workspace config at web/.npmrc` (npm reads only the root `.npmrc` for
  workspaces). The root `.npmrc` sets the public registry, so installs work.

No errors remain unresolved.
