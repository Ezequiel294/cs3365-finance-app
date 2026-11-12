# Implementation notes

Decisions made where the design documents left a choice open, deviations, and what was
verified. The design in `diagrams/` is the source of truth; this file explains how the code
reads it.

## Layout

| Path | What it is |
|---|---|
| `app/` | The Next.js 16 app (App Router). `app/(app)/<page>/` per page, `app/ui/` UI kit, `app/ui/charts/` charts, `app/actions/` Server Actions, `app/lib/` session, API client, loaders |
| `shared/` | Zod schemas, domain and response types, `FeeCalculator`, money and date helpers (imported by the app and the API) |
| `api/src/` | Routers, services, repositories, `keys.ts`, `service-factory.ts`. `api/src/index.ts` exports both Lambda handlers from one bundle (`api/build.mjs`, esbuild) |
| `api/test/` | Unit and golden tests (Vitest) |
| `infra/` | CDK app: `FinanceAppA3Data`, `FinanceAppA3Api`, `FinanceAppA3Web` |
| `gmail-script/Code.gs` | The Apps Script users paste into their Google account |
| `scripts/` | Smoke-test and local-development helpers |

The repository root is the Next.js project root (the conventions place `app/`, `shared/`,
and `api/src/` side by side), so there is one `package.json` and one `node_modules`. The API
and the CDK app have their own `tsconfig.json`.

## Decisions

### Data and keys
- **Global items need a sort key.** Every table has `PK` and `SK`. The global items use
  `PK = FX#USD-CRC#<date>, SK = RATE`, `PK = PRICE#<ticker>, SK = QUOTE`, and
  `PK = TOKEN#<sha256>, SK = TOKEN`.
- **Ids carry their date.** Transaction and investment ids are `yyyymmdd-<random>`, so the
  item key `TXN#<date>#<id>` can be rebuilt from the id in `GET`/`PATCH` routes without a
  lookup index. Corrections therefore cannot change an investment transaction's date, type,
  broker, or ticker (the 07-S01 example only changes units); record a new transaction instead.
- **Review GSI.** `review` has `reviewPK = USER#<id>` and `reviewSK = <date>#<id>`; the item
  carries `reviewReason` (`UNCATEGORIZED` or `DUPLICATE`), which the query filters on. A
  transaction that is both a possible duplicate and uncategorized shows under "Possible
  duplicates" first and moves to "To categorize" once the pair is resolved.
- **Uncategorized rollups** use the category id `uncategorized` (`MONTH#…#CAT#uncategorized`)
  so the dashboard can show it as its own muted row.
- **Transfers and card payments do not wait for a category.** They count nowhere, so they are
  saved `confirmed` without `reviewPK`. Otherwise the BAC sample's 58 transfers would flood the
  review inbox.
- **Budget limit history.** `BUDGET#id#P#…` keeps `limitCents`; changing a budget's limit,
  period, filters, or dates rebuilds all its items with the current limit (same backfill as
  03-S10).
- **Refunds** count +1 in `count` and subtract their amount from spending and budgets.

### Ingestion
- **Duplicate matching** (the design names the inputs but not the thresholds): candidates
  are on the same account, in the same currency and direction, from a *different* source,
  within ±3 days. Exact = same original amount (closest date, same bank reference preferred).
  Near = same day and amount within 10%. Manual entries are not matched on creation.
- **Merging an incoming row or email** into a stored transaction uses
  `TransactionService.merge(userId, keepId, drop, extraItems)` where `drop` is either a stored
  id (01-S04) or the incoming draft (01-S08b). The email's merchant text replaces the
  statement's 30-character cut; a user-set category is never replaced.
- **Import counts.** `imported` counts new transactions; rows merged into an existing
  transaction count in `merged` only; `transfers` counts imported or merged rows whose kind is
  `transfer`. The BAC sample gives 65 imported, 58 transfers, totals that match.
- **Checksum** compares amounts and, for BAC, the printed counts of debits and credits. A row
  whose exchange rate is missing becomes a row error and is not claimed, so it imports on the
  next upload of the file.
- **Email Message-ID** is read from the raw headers (angle brackets removed); the S3 key is
  `raw/<userId>/<sha256(messageId)>.eml`. If processing throws (for example no exchange rate),
  the `MSG#` claim is deleted and the route returns 503 so the script retries next run.
- **"Already known"** on the Connections page counts repeat deliveries of a known message
  (`MSG#` gets `lastRepeatAt`), since a repeat never creates a second `MSG#`.
- **Sender check before template.** A sender that is not on the allowlist is `rejected`
  (`SENDER_NOT_ALLOWED`); an allowed sender without a matching subject is `unparsed`
  (`NO_TEMPLATE`); a failed DKIM check is `rejected` (`DKIM_FAILED`). DKIM uses `mailauth`.
  The samples' signatures no longer verify (their bodies were redacted), so the deployed
  route answers `rejected` for them, as `samples/README.md` predicts; the golden tests call the
  template parsers directly and `DkimVerifier` is tested with a stub.
- **Normalizer.** Lower-case, accents removed, digits and punctuation removed, trailing
  Costa Rican place names dropped, words joined with `-` (URL-safe for
  `PUT /api/rules/{merchantKey}`): `AUTOMERCADO ESCAZU 042` → `automercado`.
- **One active Gmail connection.** `POST /api/connections/gmail` returns 409 while one is
  active; "Replace the key" rotates it. The connection item stores the token's hash (needed
  to delete it on rotate and revoke); the token itself is never stored or logged.
- **Stale** applies to `ACTIVE` connections only (24 h since the last call from the script).

### Money, FX, and prices
- **FX conversion** scales the BCCR rate to 10⁻⁶ and divides with BigInt, rounding half to
  even. On a date without a rate the provider first asks for the date, then for the 7 days
  before (two calls, as drawn). BCCR's `fecha` is parsed in either `yyyy-mm-dd`, `yyyy/mm/dd`,
  or `dd/mm/yyyy` form.
- **Price refresh back-off.** Besides the 1-hour wait for `NOT_FOUND`, any failed refresh is
  not retried for 1 minute, so a page that loads twice in a row does not call Yahoo twice.
- **Twelve Data** is wired (`FallbackPriceProvider` loads it lazily when
  `/FinanceApp/prices/twelvedata-api-key` exists) and tested with mocked HTTP. The parameter
  does not exist in this account, so only Yahoo runs.
- **Percent shown in a `Delta`** is rounded to one decimal ("+1.3%").

### API
- **Router prefixes.** Each feature router is mounted with Powertools `includeRouter(…,
  {prefix})`; the catalog router is mounted at `/api` because its routes are
  `/api/catalog`, `/api/categories`, and `/api/tags`.
- **`GET /api/review?type=duplicates`** returns only the pairs (01-S04); without `type` it
  returns the whole `ReviewList`.
- **Settings** default to `America/Costa_Rica` and `MONDAY` until the user saves them.

### Web
- **Sign-in** is a page outside the shell (`/sign-in`) with sign-in, sign-up, and email
  confirmation through Cognito's public `InitiateAuth`, `SignUp`, `ConfirmSignUp`, and
  `RevokeToken` operations. Tokens live in `HttpOnly`, `SameSite=Strict` cookies. A refreshed
  ID token can only be written from a Server Action, so a page render after expiry uses the
  refreshed token for that request; the next action stores it. If the API answers 401, the
  user is sent to `/sign-in?expired=1`.
- **No `revalidatePath`.** The CloudFront invalidation wiring is removed (see below), so
  client components call `router.refresh()` after a successful action instead.
- **The "To review" tile** reads the same per-request memoized `listReview()` call as the
  app shell (`app/lib/loaders.ts`, React `cache`).
- **Charts keep their aspect ratio** (`viewBox`, `width: 100%`, height auto up to the fixed
  height) so axis text is never stretched on a phone.
- **Dialogs opened from the URL.** `/budgets?new=1` and `/budgets?edit=<id>` open the budget
  dialog, so the dashboard's "Create a budget" and the card's "Edit" are plain links.

### Infrastructure
- **Cognito** (user pool with self sign-up and email verification, public app client with
  `USER_PASSWORD_AUTH`) lives in the API stack, next to its JWT authorizer.
- **raw-ingest CORS** needs the CloudFront domain, which the API stack cannot reference
  without a cycle. The web stack sets it with an `AwsCustomResource` (`S3:putBucketCors`)
  allowing `POST` from `https://<distribution>.cloudfront.net` and `http://localhost:3000`.
  The API stack defines no CORS of its own, so its updates do not reset the rule.
- **Global catalog seed** is an `AwsCustomResource` (`DynamoDB:batchWriteItem`) whose
  physical id changes on every synth, so it runs on every deployment.
- **cdk-nextjs**: the `DistributionIdParameter`, `InvalidationPolicy`, and the
  `CDK_NEXTJS_DISTRIBUTION_ID_PARAM_NAME` variable are removed right after the construct is
  created. `cdk synth` was checked: no template contains an `AWS::SSM::Parameter` resource.
- **HTTP API** has stage throttling (25 req/s, burst 50) and JSON access logs; Lambda log
  groups keep 1 month.
- The CDK app builds the API bundle with esbuild at synth time (no Docker); cdk-nextjs runs
  `npm run build` (`next build`) itself. `next.config.ts` pins `turbopack.root` and
  `outputFileTracingRoot` to this folder.

## Security notes
- All `/api/*` routes are behind the Cognito JWT authorizer; `userId` is the token's `sub`.
  Anonymous `GET /api/catalog` returns `401` with `www-authenticate: Bearer` from API Gateway
  (verified). Signed-in pages redirect anonymous visitors to `/sign-in` (verified on the
  deployed CloudFront URL).
- The `/ingest/gmail*` routes use the design's random 32-byte ingest token, stored only as a
  SHA-256 hash, revocable at any time (verified: a revoked or unknown key gets `401`).
- No secret is in code, files, environment variables, or logs. Lambdas receive only SSM
  parameter *names* and read `/FinanceApp/bccr/*` with decryption at runtime. Tests use a
  placeholder token and mocked HTTP. Logs carry error names, tickers, and HTTP statuses, never
  amounts, merchants, account numbers, or email bodies.
- The raw-ingest bucket blocks all public access, enforces TLS, and expires objects after 90
  days; uploads are presigned POSTs limited to one key, 1 byte to 1 MiB, 5 minutes.
- `scripts/local-api.mjs` is a development-only harness that serves the API bundle on
  `127.0.0.1` **without** JWT verification. It refuses to start unless
  `LOCAL_API_UNVERIFIED_TOKENS=1` is set and is never deployed.

## Verification done
- `npm run typecheck` (app, API, infra) and `npm test`: 16 test files, 171 tests, all passing,
  including the golden tests for all four samples (`api/test/golden/bank-formats.golden.test.ts`).
- Deployed `FinanceAppA3Data`, `FinanceAppA3Api`, and `FinanceAppA3Web` in `us-east-2`.
- On AWS, through ApiFn: the 16 global categories are seeded; a ₡14,000 manual entry was
  converted at the live BCCR rate; the BAC sample uploaded with the presigned POST was
  processed by `ImportWorkerFn` (65 imported, 58 transfers, checksum OK); re-uploading it gave
  409 `ALREADY_IMPORTED`; a Gmail key authenticated `/ingest/gmail/config`, the BAC alert was
  `rejected` with `DKIM_FAILED` (expected for the redacted sample), and the heartbeat updated
  the connection; budgets backfilled; live Yahoo quotes for `VT` and `SHOP.TO` (converted with
  `USDCAD=X`); `VTXXQ` answered 404 "No instrument VTXXQ on Yahoo Finance".
- Every page was rendered by a local Next.js server against the deployed tables (through the
  local harness) and checked for its content and wording. Screenshots could not be taken:
  headless Chrome cannot start inside this sandbox.
- Not verified: a full browser session through Cognito on the deployed site (creating a user
  needs a mailbox to receive the confirmation code), and the Gmail script inside Google.
- The smoke tests left their records under the synthetic user `smoke-test-0000-0001` in the
  `FinanceAppA3Data` tables (two BAC accounts, the imported sample, a broker, a budget, and a
  revoked Gmail connection). No real user can sign in as that id.

## Problems met
- First deploy of the ingest route: a repeat delivery of the same email returned 500,
  `ValidationException: ExpressionAttributeNames must not be empty` (an update without
  attribute names). Fixed in `DynamoStore.update`, covered by a test, and redeployed.
