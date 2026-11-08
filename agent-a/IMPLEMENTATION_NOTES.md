# Implementation notes

Built in one session from `diagrams/` (scope, architecture, classes, routes, keys) with
`one-pagers/` as background. Where the two disagree the diagrams were followed.

## Deployed

All in account `us-east-2` (CloudFront is global).

| Stack | Contents |
|---|---|
| `FinanceAppA1Data` | Five DynamoDB tables (on-demand, PITR, `RETAIN`): Transactions (GSI `review`), InvestmentTransactions (GSI `ticker`), Aggregates (TTL), Reference, Ingestion (TTL). Two custom resources seed the GLOBAL categories, tags, and merchant rules |
| `FinanceAppA1Api` | Cognito user pool and web client, private raw-ingest S3 bucket, `ApiFn` and `ImportWorkerFn` (one bundle), HTTP API with a Cognito JWT authorizer on `ANY /api/{proxy+}` and three unauthenticated `/ingest/gmail*` routes |
| `FinanceAppA1Web` | `cdk-nextjs` `NextjsGlobalFunctions`: Next.js server Lambda (Function URL, `AWS_IAM`, CloudFront OAC), static-assets and cache buckets, cache-tags table, CloudFront distribution and function |

| Output | Value |
|---|---|
| App (CloudFront) | https://d49sywx0ptz9d.cloudfront.net |
| HTTP API | https://ujj3g6p65a.execute-api.us-east-2.amazonaws.com |
| User pool / web client | `us-east-2_Q3l8s9KCM` / `4i6f703qgrl2t58rkcd7l95p82` |
| ApiFn | `FinanceAppA1Api-ApiFnE0725F78-tNoo0UkW5yFF` |
| Raw-ingest bucket | `financeappa1api-rawingest26c2413e-d6xbx6vexj7k` |

## Verification

### Unit tests and type checks

`npm run typecheck` passes in all four workspaces. `npm test` passes: **112 tests**.

| Workspace | Tests | Covers |
|---|---|---|
| `shared` | 5 | Request schemas, `countsAsSpending`, money parsing and formatting |
| `api` | 98 | RollupPlanner; FxService (half-to-even integer conversion, caching, refusal without a rate); BccrRateProvider (URL with `URLSearchParams`, bearer header, `datos[0].series` parsing, weekend fallback, non-200) with a mocked fetch and mocked SSM; Normalizer, Categorizer, RuleService; PeriodCalculator, BudgetMatcher, BudgetService backfill and period change, BudgetAnalyticsService progress (over 100%) and burn-down; TransactionService create/update/merge, version retry then 409, income, FX refusal; CSV and email parsers with golden tests on synthetic fixtures; TemplateRegistry; DkimVerifier (real RSA signature, tampering, wrong domain); IngestPipeline for CSV (row errors, file and row idempotency, FX retry) and email (duplicates, DKIM rejection, unparsed, exact merge, near match, claim release); ConnectionService (hash-only storage, activation, staleness, revoke, rotate); HoldingCalculator, InvestmentService (deposit, buy, sell guard, correction replay), BrokerService, PriceClient (cache, stale fallback, unavailable), Twelve Data provider (missing SSM key → unavailable); ApiHandler routing and error mapping; the Gmail script embedded in the API matches `gmail-script/Code.gs` |
| `web` | 2 | Original-currency and USD formatting (05-S01), month helpers |
| `infra` | 7 | CDK assertions on the data and API stacks: table settings, indexes, authorizer only on `/api/*`, one bundle for both Lambdas, SSM names only, private bucket, no physical names |

AWS clients are mocked at the client boundary with `aws-sdk-client-mock`; DynamoDB uses an
in-memory fake (`api/test/support/fake-dynamo.ts`) that evaluates the key, condition, filter, and
update expressions the code uses, including all-or-nothing `TransactWriteItems`.

### Against the deployment

| Check | Result |
|---|---|
| CloudFront URL loads the app | `GET /signin` → 200 with the sign-in page; CSS and JS chunks → 200; `/dashboard` anonymous → 307 to `/signin` |
| `/api/*` without a token | API Gateway `GET /api/review` → **401** `{"message":"Unauthorized"}`; CloudFront `GET /api/review` (Next.js proxy) → **401** |
| `/ingest/gmail` with an invalid token | **401** `{"code":"UNAUTHORIZED","message":"invalid ingest token"}`; same for `/config` and `/heartbeat` |
| Sign-up and sign-in reach Cognito | The deployed sign-up form, submitted through CloudFront with a weak password, shows "Password: Password must have uppercase characters" (no user created); sign-in with an unknown user shows "Incorrect email or password." |
| Next.js Function URL directly | 403 anonymous (only CloudFront OAC can call it) |
| Raw-ingest bucket | Anonymous GET → 403; CORS preflight from the CloudFront origin → allowed for POST |
| `scripts/smoke-test.mjs` | **21/21 passed**: manual CRC entry converted at the live BCCR rate (454.56 on 2026-10-14), category from a global rule, spending by category, review count, budget, zero-filled monthly totals, broker and buy, prices unavailable without a key, Gmail connect → config 200 → unsigned email rejected by DKIM → heartbeat → ACTIVE → revoke → 401, CSV upload through the presigned POST processed by `ImportWorkerFn` (4 imported, 1 merged with the manual entry, rows 7 and 8 reported), same file refused with 409. All synthetic-user items and S3 objects were deleted afterwards; two FX cache items (`FX#USD-CRC#2026-10-14`, `#2026-10-11`) remain as normal cached data |

Not verified: the signed-in pages in a real browser, because no Cognito user could be created.
Their server side is exercised by the smoke test (same API, same Lambda) and their build by
`next build`.

## What was built per in-scope story

| Story | Built |
|---|---|
| 01-S02 Import a statement | `/import`: browser SHA-256, `POST /api/imports` claims `FILE#` and returns a presigned POST (1 MB max), S3 event starts `ImportWorkerFn`, `IngestPipeline.processCsv` detects the template by header row, parses and validates each row, skips `ROWFP#` repeats, merges exact email matches, reports each bad row with its reason; the page polls every 2 s |
| 01-S03 Add by hand | Transactions form: amount and date required, date defaults to today, currency to the account's; `TransactionService.create` converts, categorizes, matches budgets, one `TransactWriteItems` |
| 01-S04 Possible duplicates | Pipeline merges exact cross-source matches and flags near ones (`possibleDuplicateOf`, review GSI); `/review` shows pairs with merge either way or keep both |
| 01-S05 Money in | "Money in" toggle, `kind = income`, date the money arrived; rollups add `incomeCents`, budgets untouched |
| 01-S08 Connect Gmail | `/connections`: token shown once with the script; only the SHA-256 is stored; `setup()` calls `/ingest/gmail/config` (activates the connection, returns senders); `POST /ingest/gmail` stores the raw MIME in S3, claims `MSG#`, verifies DKIM and the sender, matches a template, parses, matches duplicates, saves |
| 01-S09 Stale connection | Heartbeat on every script run; `list` marks ACTIVE connections stale after 24 h; banner on the dashboard and connections page with a Reconnect button (rotate) |
| 02-S02 Category and tags | Category select and tag toggles on every row; `PATCH` moves the amount between CAT/TAG/budget rollups with a version condition |
| 02-S03 Automatic | Normalizer → user rule → GLOBAL rule → else uncategorized (`pending_review`, review GSI); `categorizedBy` recorded |
| 02-S05 Correction remembered | After a category change the row asks "Always file X as Y?"; Yes → `PUT /api/rules/{merchantKey}` |
| 02-S06 Review inbox | "N to review" on the dashboard; `/review` lists uncategorized (categorize in place), duplicates, and unparsed emails, with the count |
| 03-S02 Budget per category/tags | Create with categories and/or tags; backfill of the current and 11 earlier periods; progress for all budgets |
| 03-S10 Week/month/year | Weekly (user's week start), monthly, quarterly, yearly, custom; changing the period rebuilds the rollups; stale version → 409 |
| 03-S11 Proportion used | Percent without upper bound, remaining, amount over shown as text; burn-down page with even-pace line |
| 04-S01 Last month's money | Dashboard defaults to last month, ranked category list with shares, Uncategorized kept |
| 04-S03 Tag breakdown | Tag toggle, overlap note, budget limit next to tags with a monthly single-tag budget |
| 04-S06 Income vs spending | `/cashflow`: 12 complete months, two series, empty months as $0, table |
| 05-S01 Original currency | Rows show the original amount first, then "($27.40 at 510.95 on Oct 14)" |
| 05-S02 BCCR rate | `FxService` + `BccrRateProvider` (SSM once per container, cached `FX#` items, weekend fallback, 503 when unavailable) |
| 05-S06 Import keeps its currency | Currency from the row (or from the account if the template says so); unknown currency is a row error |
| 06-S02 See and withdraw access | Connections page lists what the app can access, the token prefix and last seen time; Revoke with the warning text; the next script call gets 401 and the script removes its trigger |
| 07-S01 Record a holding | Buy/sell with ticker, units (6 decimals), gross, commission; correction rebuilds the holding from the ticker GSI |
| 07-S02 Market prices | `PriceClient` with a 15-minute cache, stale fallback marked with its age, unavailable when none |
| 07-S03 Broker fees | One rule per broker (flat cents + basis points), versioned `PUT /api/brokers/{id}` |
| 07-S04 Contribution with fees | Deposit (cash += amount − commission) and buy (cost += gross + commission) each in one transaction; cost basis per unit shown |
| 07-S05 If sold today | Market value − sell commission per holding, unrealized gain, plus broker cash, price time, "before taxes" |

Out of scope and not built: every story in the backlog table of `diagrams/sequences/README.md`.

### Left incomplete

- **Bank templates are placeholders.** `example-bank-email-v1` (sender `alertas@example-bank.test`)
  and `example-bank-csv-v1` match synthetic fixtures only. Real alerts are rejected (sender not
  allowlisted) and real statements fail with "no bank template matches this file" until real
  templates are added.
- **Market prices are unavailable** until `/FinanceApp/prices/apiKey` (a Twelve Data key) exists.
- Signed-in pages were not clicked through in a browser (no Cognito user available).
- One-pager NFRs that the design does not cover were not built or measured: offline entry,
  5,000-row import in 10 s on a phone, 300 ms manual-entry latency.

## Decisions and assumptions

### Data and keys

- **IDs carry their date** (`20261014-xxxxxxxxxxxx`) so `get(userId, id)` can rebuild
  `TXN#<date>#<id>` / `INV#<date>#<id>` without another index. A record's date cannot be edited.
- **Review GSI sort key** is `reviewSK = <reason>#<date>#<id>` with reasons `DUPLICATE` and
  `UNCATEGORIZED`, so `listReview(userId, "DUPLICATE")` is a `begins_with` query. A flagged
  duplicate shows under duplicates; after "keep both" it falls back to `UNCATEGORIZED` if it has no
  category.
- Global items (`FX#…`, `PRICE#…`, `TOKEN#…`) use the sort key `ITEM`, since every table has
  `PK` + `SK`.
- Uncategorized spending is rolled up under `MONTH#<m>#CAT#uncategorized`.
- `PRICE#` items get a DynamoDB TTL of 7 days, not 15 minutes: freshness (15 minutes) is checked
  on `retrievedAt`, and a longer TTL keeps the last known price for the stale fallback the design
  requires.
- FX cache items have no TTL (one per date, small, and rates do not change).
- `ROWFP#` items expire after 400 days and `MSG#` items after 90 days.
- Tables use `RETAIN` and PITR as designed; deletion protection was not added. The raw-ingest
  bucket and the user pool are also `RETAIN`. Raw emails and CSVs expire after 30 days.

### Money and rollups

- `countsAsSpending()` is false for income, transfer, card payment. **Refunds and SINPE received
  subtract from spending**; purchases and SINPE sent add to it.
- Income, transfers, and card payments never go to the review inbox when they have no category;
  only spending does.
- FX conversion uses the rate with 8 decimals as an exact `BigInt` and rounds half-to-even.
- When BCCR has a value for a weekend date (it does, per the live smoke test) that value is used;
  the 7-day fallback runs only when the series is empty.
- Investments: deposit adds `amount − commission` to cash; withdrawal subtracts `amount`; buy
  subtracts `gross + commission`; sell adds `gross − commission`. `MONTH#…#INV` adds deposited,
  withdrawn, bought, sold, commissions, realized gain.
- 07-S04's narrative says both commissions become part of the cost basis, but its diagram note
  adds only `gross + commission` of the buy to the holding and takes the deposit commission out of
  cash. The note was followed; the deposit commission shows in `commissionsCents`.
- A correction (07-S01) writes the corrected trade, the rebuilt holding, the cash change, and the
  realized-gain changes of later sales of that ticker in **one** `TransactWriteItems` (the diagram
  draws two steps). Over 100 items is refused.
- Selling estimate uses each broker's rule; holdings without a price are left out and flagged.

### Ingestion

- **Duplicate matching**: exact = same account, currency, kind, original amount, and day, from a
  different source → merged. Near = same account and currency within ±1 day (statements) or ±2
  days (email, manual), with the same amount on a nearby day or an amount within 5% on the same
  day → saved with `possibleDuplicateOf`. Records from the same source are never matched (each
  source has its own idempotency key).
- The pipeline's exact match uses a new `TransactionService.mergeParsed` (the class diagram's
  `merge(userId, keepId, dropId)` needs two saved transactions). A category set by the user is
  never replaced.
- **Row fingerprint** = SHA-256 of template, account, trimmed cells, and the count of identical
  rows before it in the same file. Two identical purchases in one file import as two; the same
  rows in an overlapping statement are skipped.
- A row claim is released when its save fails, and a message claim is released when processing
  throws, so a retry (re-import or the script's next run after a 5xx) is processed instead of
  skipped.
- `FILE#` can be claimed again when its import failed, when rows failed only for lack of an
  exchange rate, or when an upload never arrived within 20 minutes.
- The worker re-hashes the uploaded object and fails the import if it is not the selected file.
- An email's account is found by the last 4 digits; no match → unparsed, shown in the inbox.
- `DkimVerifier` implements RFC 6376 (rsa-sha256 and ed25519-sha256, simple/relaxed), looks up the
  key in DNS, and requires the From domain and the signing domain to be an allowlisted bank domain.
- The Gmail label is `financeapp-processed` (the design's `yourapp-processed` uses a placeholder
  product name). Labels are per thread in Gmail, so the script sends every allowlisted message of an
  unlabelled thread and relies on the server's `MSG#` idempotency; it searches the last 14 days and
  refreshes the sender list every 6 hours.
- The token is entered by the user as the script property `INGEST_TOKEN`; the script source never
  contains it. `INGEST_BASE_URL` (the HTTP API URL) is filled into the script by the API.

### Budgets

- `BudgetMatcher.matching` and `PeriodCalculator.periods` take the user's week start as an extra
  argument.
- Backfill writes a `P#` item for each of the 12 periods (zeros included) and `D#` items for days
  with spending. A transaction saved while a backfill runs could be counted twice or missed; the
  design accepts this by rebuilding on every period or filter change.
- A limit change also rebuilds, so each period's `limitCents` is the current limit.
- A custom budget's current period is its whole range.

### API surface beyond the route table

These supporting routes were added because the stories cannot be used without them; they follow
the same router → service → repository layering:

- `GET /api/reference` (accounts, categories, tags), `POST /api/accounts`, `POST /api/categories`,
  `POST /api/tags`, `GET/PUT /api/settings` (time zone, week start) in `ReferenceRouter` /
  `ReferenceService`. Account balances are not tracked (01-S06 is out of scope).
- `GET /api/brokers`, and `PUT /api/brokers/{id}` with `version: 0` creates a broker.
- `GET /api/investments/transactions` so older trades can be corrected.
- The Next.js app also answers `/api/*` on the CloudFront origin (`app/api/[...path]/route.ts`),
  forwarding with the session's ID token, because sequence diagrams 06-S02 and 01-S09 show the
  browser calling `GET /api/connections` on the web server. Without a session it returns 401.

### Web app

- Next.js 16.4 App Router; Server Actions are the UI controllers (`web/actions/*`), pages are
  Server Components, `ApiClient` sends the ID token as a bearer token from the server only.
- Sessions: ID token, refresh token, and expiry in `HttpOnly`, `Secure`, `SameSite=Strict`
  cookies. Tokens refresh one minute before expiry; during page rendering the refreshed token is
  used for that request only (cookies are read-only there) and stored by the next action.
- Sign-up, confirmation, sign-in, and sign-out call Cognito's public API with `fetch`, so the
  server needs no AWS credentials for them. Confirmation codes are sent by Cognito's default email
  (limited to about 50 emails a day). Feature plan: Lite. Password policy: 8+ characters with
  upper, lower, digit, symbol.
- Mutations call `refresh()` from `next/cache` instead of `revalidatePath`, so no CloudFront
  invalidation is ever needed.
- The dashboard opens on last month; the cash-flow page shows the last 12 complete months.
- Charts are plain SVG; no chart library.

### Infrastructure

- The Cognito user pool is in the API stack (the JWT authorizer needs it); the web stack reads its
  IDs and the API URL through cross-stack references.
- `ApiFn` and `ImportWorkerFn` are two `NodejsFunction`s with the same entry (`api/src/index.ts`)
  and bundling options, so they share one asset; handlers `index.apiHandler` and
  `index.importWorkerHandler`. Node.js 24, arm64, bundled locally by esbuild (no Docker).
- Lambdas get `ssm:GetParameter(s)` on `/FinanceApp/bccr/*` and `/FinanceApp/prices/apiKey`, and
  `kms:Decrypt` only via SSM, for SecureString values. Environment variables hold table names, the
  bucket name, and parameter names only.
- HTTP API default stage throttle: 50 requests/s, burst 100.
- The raw-ingest bucket's CORS allows POST from `https://*.cloudfront.net` and
  `http://localhost:3000`. The web stack depends on the API stack, so the exact distribution
  domain cannot be named there without a cycle; uploads are still authorized only by the
  presigned policy (exact key, 1 MB, 15 minutes).
- **cdk-nextjs's CloudFront invalidation wiring was removed** in `WebStack`: it creates an
  `AWS::SSM::Parameter` named `cdk-nextjs-distribution-id-…` (a fixed physical name outside the
  `FinanceApp` prefix), and the account's CloudFormation policy allows only reading SSM
  parameters. The parameter, its IAM policy, and the env var that points to it are removed with
  escape hatches. This was decided from the stated policy before deploying, so no error was
  observed; the app never revalidates, so nothing depends on it.
- cdk-nextjs 0.7.20 requires `debug` at synth time without declaring it; it was added as a
  dependency (see errors below).
- TypeScript is pinned to 5.9 (TypeScript 7 is the native port and was avoided for tool
  compatibility). Vitest 5, Zod 4, AWS SDK v3, Powertools event-handler 2.36.
- **Market price provider: Twelve Data** (`GET /price?symbol=…&apikey=…`), chosen for its free
  Basic plan covering US stocks, ETFs, funds, and crypto pairs. Crypto is entered as `BTC/USD`.
  While the SSM parameter is missing, quotes fail with "price API key is not configured" and the
  parameter is checked again every 5 minutes, so adding it needs no redeploy.

### Security notes

- `/api/*` requires a Cognito JWT at API Gateway; the Next.js Function URL accepts only
  CloudFront (OAC, `AWS_IAM`); all buckets block public access; DynamoDB is reached only through
  IAM.
- The Gmail ingest token is a bearer secret the product generates, as the design specifies (the
  Apps Script cannot do Cognito sign-in or SigV4). Only its SHA-256 is stored, it is shown once,
  it can be rotated or revoked at any time, and every call looks the hash up.
- Logs carry error classes, routes, IDs, and counts only; never amounts, merchants, account
  numbers, email bodies, or tokens. The BCCR token was never read, printed, or stored by this
  session; tests use a mocked HTTP response and a fake token string.

## Errors encountered

| Error | Resolution |
|---|---|
| `aws: [ERROR]: [Errno 17] File exists: '/Users/keisynf/.aws/cli/cache'` on the first `aws sts get-caller-identity` | Re-ran the `aws` CLI with `HOME=$HOME/.finance-aws` as instructed. Identity: `assumed-role/FinanceAgentDevRole` |
| `npm error code E401 Unable to authenticate, your authentication token seems to be invalid.` before a `package.json` existed | The workspace `.npmrc` only applies once npm finds the project root; creating `package.json` fixed it |
| `Error: Cannot find module 'debug'` (from `cdk-nextjs/lib/nextjs-build/nextjs-build.js`) on the first `cdk synth` | Added `debug` to the infra and web dependencies |
| The first background `cdk deploy` stopped after the agent tool's 120 s limit (Data and Api stacks completed; Web had not started) | Re-ran the deploy with a longer limit; all three stacks completed |

No unresolved errors.
