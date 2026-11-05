# Sequence Diagrams

These diagrams cover the user stories in [`../../one-pagers/`](../../one-pagers/) that are
in scope for this iteration of the design. They are grouped into one file per module of
the [context model](../context.md), and every participant is a component of the
[architecture diagram](../architecture.md). Stories outside this iteration's scope are
listed at the end and form part of the product backlog.

## Why these diagrams are valuable to the design

- **They turn each story into concrete calls.** Each diagram names the route, the service
  method, and the DynamoDB items it reads or writes, so a code generator has an
  unambiguous order of operations instead of a sentence of intent.
- **They show where the hard rules live.** Idempotency checks, optimistic-lock
  conditions, the single `TransactWriteItems` that keeps rollups and budgets consistent,
  and the places a failure must stop instead of guessing are all drawn explicitly.
- **They define the class diagram.** Every service, repository, and helper that appears
  as a participant must exist as a class, and every message must exist as a method.
- **They expose shared paths.** Manual entry, Gmail alerts, and CSV statements all end in
  the same save path. Drawing them shows the reuse, so it is built once.

## Conventions

| Participant | What it is |
|---|---|
| `Browser` | The Next.js UI running in the user's browser |
| `Next.js server` | The Next.js server Lambda behind CloudFront (Server Actions and Route Handlers) |
| `ApiFn router` | API Gateway (HTTP API) plus the Powertools router inside `ApiFn` |
| `...Service`, `...Pipeline`, `...Calculator` | Classes inside `ApiFn` or `ImportWorkerFn` (same code bundle) |
| `Transactions`, `InvestmentTx`, `Aggregates`, `Reference`, `Ingestion` | The five DynamoDB tables in `FinanceAppData` |
| `S3 raw-ingest` | The private bucket for raw emails and CSV uploads |
| `ImportWorkerFn` | The background Lambda started by the S3 event when a CSV is uploaded |

Rules that apply to every diagram, so they are not repeated in each one:

1. **Authentication.** Every `Browser → Next.js server → ApiFn` request carries the user's
   session cookie. The Next.js server forwards the Cognito ID token as a bearer token, and
   API Gateway's JWT authorizer rejects the request with `401` before `ApiFn` runs if the
   token is missing or expired. The only routes outside Cognito are the `/ingest/gmail*`
   routes, which use the hashed ingest token (see 01-S08).
2. **Partitioning.** Every item a user owns has `PK = USER#<userId>`. `userId` is the
   Cognito `sub` claim, never a value sent by the browser.
3. **The save path.** "`TransactionService.save`" always means: convert to USD, match
   budgets, then one `TransactWriteItems` that writes the transaction and every rollup it
   affects (day, month, category, tag, and budget period and day items). Edits and deletes
   subtract the old values and add the new ones in the same call, with a `version`
   condition. If the condition fails, the service re-reads and retries once, then returns
   `409`. Transactions with `kind = transfer` or `kind = card_payment` are kept out of
   spending rollups and budgets.
4. **Errors.** Services throw typed errors, and one central handler maps them to
   `{code, message}` with an HTTP status. Diagrams show only the error branches that change
   what the user sees.
5. **Logging.** Nothing logs amounts, merchant names, account numbers, or email bodies.

## Keys and indexes used in these diagrams

| Table | Items (SK unless noted) |
|---|---|
| `Transactions` | `TXN#<date>#<id>`. GSI **review** (`reviewPK`, sparse: set only while a transaction needs a decision) |
| `InvestmentTx` | `INV#<date>#<id>`. GSI **ticker** (`USER#id#<ticker>`) |
| `Aggregates` | `DAY#<date>#TOTAL`, `MONTH#<yyyy-mm>#TOTAL`, `#CAT#<id>`, `#TAG#<id>`, `#INV`, `BUDGET#<id>#P#<periodStart>`, `BUDGET#<id>#D#<date>`, `HOLDING#<broker>#<ticker>`, `CASH#<broker>`. Global: `PK = FX#USD-CRC#<date>`, `PK = PRICE#<ticker>` (TTL) |
| `Reference` | `PROFILE` (time zone, week start), `ACCOUNT#`, `CAT#`, `TAG#`, `RULE#<merchantKey>`, `BUDGET#`, `BROKER#`. Global (`PK = GLOBAL`): `CAT#`, `TAG#`, `RULE#` |
| `Ingestion` | `CONN#gmail#<id>`, `MSG#<Message-ID>`, `IMPORT#<id>`, `FILE#<sha256>`, `ROWFP#<hash>`. Lookup: `PK = TOKEN#<sha256>` |

## Index (in scope)

| Story | Title | Diagram |
|---|---|---|
| 01-S02 | Import a statement file | [01](01-accounts-and-ingestion.md#01-s02--import-a-csv-statement) |
| 01-S03 | Add a transaction by hand | [01](01-accounts-and-ingestion.md#01-s03--add-a-transaction-by-hand) |
| 01-S04 | Review possible duplicates | [01](01-accounts-and-ingestion.md#01-s04--review-possible-duplicates) |
| 01-S05 | Record incoming money | [01](01-accounts-and-ingestion.md#01-s05--record-incoming-money) |
| 01-S08 | Authorise a connection (Gmail) | [01](01-accounts-and-ingestion.md#01-s08a--connect-gmail) (2 diagrams) |
| 01-S09 | Be told a connection stopped working | [01](01-accounts-and-ingestion.md#01-s09--detect-a-stale-connection) |
| 02-S02 | Category and tags on a transaction | [02](02-categorization-and-rules.md#02-s02--set-category-and-tags) |
| 02-S03 | Automatic categorization | [02](02-categorization-and-rules.md#02-s03--categorize-automatically) |
| 02-S05 | Correction remembered | [02](02-categorization-and-rules.md#02-s05--correct-and-remember) |
| 02-S06 | Find uncategorized transactions | [02](02-categorization-and-rules.md#02-s06--clear-the-review-inbox) |
| 03-S02 | A limit per category or tags | [03](03-budgets-and-limits.md#03-s02--create-a-budget-and-see-all-progress) |
| 03-S10 | Week, month, or year budgets | [03](03-budgets-and-limits.md#03-s10--change-a-budgets-period) |
| 03-S11 | Proportion used, including over 100% | [03](03-budgets-and-limits.md#03-s11--proportion-used) |
| 04-S01 | Where last month's money went | [04](04-dashboard-and-insights.md#04-s01--where-last-months-money-went) |
| 04-S03 | Breakdown by tag and category | [04](04-dashboard-and-insights.md#04-s03--breakdown-by-tag-and-category) |
| 04-S06 | Income alongside spending | [04](04-dashboard-and-insights.md#04-s06--income-alongside-spending) |
| 05-S01 | Original currency always shown | [05](05-multi-currency-and-roles.md#05-s01--show-the-original-currency) |
| 05-S02 | The rate behind converted amounts | [05](05-multi-currency-and-roles.md#05-s02--convert-at-the-bccr-rate) |
| 05-S06 | Import keeps its currency | [05](05-multi-currency-and-roles.md#05-s06--import-a-statement-in-its-own-currency) |
| 06-S02 | See and withdraw access | [06](06-security-and-data-control.md#06-s02--see-and-revoke-the-gmail-connection) |
| 07-S01 | Record a holding | [07](07-investments-and-net-worth.md#07-s01--record-a-holding) |
| 07-S02 | Value holdings at market prices | [07](07-investments-and-net-worth.md#07-s02--value-holdings-at-current-prices) |
| 07-S03 | Describe broker fees | [07](07-investments-and-net-worth.md#07-s03--describe-a-brokers-commission) |
| 07-S04 | Record a contribution with fees | [07](07-investments-and-net-worth.md#07-s04--record-a-contribution-with-commissions) |
| 07-S05 | What I would receive if I sold today | [07](07-investments-and-net-worth.md#07-s05--value-if-sold-today) |

## Not covered in this iteration (backlog)

These stories describe capabilities the current design does not include. They have no
sequence diagram and are carried into the product backlog.

| Story | Title | What the design lacks |
|---|---|---|
| 01-S01 | Connect an account | Split story; replaced by 01-S07 to 01-S09 |
| 01-S06 | All accounts and balances | Account balances are not tracked |
| 01-S07 | Which institutions can be connected | No institution capability list |
| 02-S01 | Prompt at the time of the charge | No push notifications or in-app prompts |
| 02-S04 | Create and order rules | Rules are only created from corrections; no rule editor, ordering, or amount ranges |
| 02-S07 | See and undo silent filing | No view of rule-filed transactions |
| 03-S01 | Threshold warning | No budget alerts |
| 03-S03 | Safe to spend | No commitments or available-balance model |
| 03-S04 | Runway | Depends on account balances |
| 03-S05 | Share a household budget | Split story; replaced by 03-S07 to 03-S09 |
| 03-S06 | Confirm commitments | No commitments model |
| 03-S07 | Invite a partner | No shared budgets |
| 03-S08 | Who paid in a shared budget | No shared budgets |
| 03-S09 | End sharing | No shared budgets |
| 03-S12 | Year-end saving | Not designed |
| 04-S02 | Compare against prior periods | Not designed |
| 04-S04 | Drill through to transactions | Not designed |
| 04-S05 | Household split by person | No shared budgets |
| 05-S03 | Pair and confirm a transfer | Transfers are a transaction kind; no pairing |
| 05-S04 | Account roles | Not designed |
| 05-S05 | Conversion cost | Depends on transfer pairing |
| 06-S01 | No prompts to connect | Not designed |
| 06-S03 | Device lock | Not designed |
| 06-S04 | Export all data | Not designed |
| 06-S05 | Delete all data | Not designed |
| 06-S06 | Recover the account | Not designed beyond Cognito defaults |
| 07-S06 | Net worth | Depends on account balances |

## Where the design differs from the one-pagers

- A transaction has **one category and any number of tags**. Where a one-pager says
  "spending group", read "tag". Budgets are set per category and/or tags.
- Totals are kept in **USD**. CRC amounts are converted at the BCCR rate of the transaction
  date. The original amount, currency, rate, and rate date stay on the transaction.
- A transaction that arrives from both Gmail and a CSV statement is **merged
  automatically**. Only near matches are flagged for the user to review.
- Parsing uses **bank templates only**. There is no LLM fallback and no user column mapping.
- The only "connection" is the **Gmail script**. Bank connection APIs are out of scope.
- Each broker has **one commission rule** (flat and/or percentage). The user enters the
  actual commission on each investment transaction.
