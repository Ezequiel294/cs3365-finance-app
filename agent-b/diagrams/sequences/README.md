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
- **They end in a screen, not in a sentence.** Each diagram's last messages name the page
  section and the component that shows the result, and three supporting diagrams (02-S02a,
  04-S01a, 07-S02a) show how several stories share one page.

## Conventions

| Participant | What it is |
|---|---|
| `Browser` | The Next.js UI running in the user's browser. The component names in its messages (`BarList`, `BudgetCard`, `Dialog`, ...) are classes of [class diagram section 2](../class-diagram.md#2-nextjs-layer) |
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
6. **What the user sees.** The last `Web-->>UI` or `UI-->>U` messages of a diagram name the
   page section and the component that shows the result. Text in quotes is an example of
   the content inside that component; it is not the layout, and it is never printed as a
   bare line of text. The layout, the order of the sections, and the exact wording of each
   page are in class diagram section 2d.
7. **States.** Every page render shows a skeleton while it loads, one empty state when
   there is no data, and an error state with "Try again" when a call fails. Every action
   disables its button while it runs and ends in a toast or in errors under the fields.
   Creating or editing anything happens in a dialog. These are drawn only where a diagram
   needs them.

## Keys and indexes used in these diagrams

| Table | Items (SK unless noted) |
|---|---|
| `Transactions` | `TXN#<date>#<id>`. GSI **review** (`reviewPK`, sparse: set only while a transaction needs a decision) |
| `InvestmentTx` | `INV#<date>#<id>`. GSI **ticker** (`USER#id#<ticker>`) |
| `Aggregates` | `DAY#<date>#TOTAL`, `MONTH#<yyyy-mm>#TOTAL`, `#CAT#<id>`, `#TAG#<id>`, `#INV`, `BUDGET#<id>#P#<periodStart>`, `BUDGET#<id>#D#<date>`, `HOLDING#<broker>#<ticker>`, `CASH#<broker>`. Global: `PK = FX#USD-CRC#<date>`, `PK = PRICE#<ticker>` (`marketTime` is shown to the user; fresh for 15 min by `retrievedAt`; DynamoDB TTL 30 days so the last known price survives) |
| `Reference` | `PROFILE` (time zone, week start), `ACCOUNT#` (bank, currency, `iban`, `cardLast4s`), `CAT#`, `TAG#`, `RULE#<merchantKey>` (category, tags, optional kind), `BUDGET#`, `BROKER#` (fee schedule). Global (`PK = GLOBAL`): `CAT#` (the sixteen categories seeded at deploy), `RULE#` |
| `Ingestion` | `CONN#gmail#<id>`, `MSG#<Message-ID>` (status, reason, rawRef), `IMPORT#<id>`, `FILE#<sha256>` (latest importId and its status; reclaimable when `FAILED`), `ROWFP#<hash>` (written in the same transaction as the row's `TXN`). Lookup: `PK = TOKEN#<sha256>` |

## Index (in scope)

| Story | Title | Diagram |
|---|---|---|
| 01-S02a | Register an account (supports 01-S02, 01-S08) | [01](01-accounts-and-ingestion.md#01-s02a--register-an-account) |
| 01-S02 | Import a statement file | [01](01-accounts-and-ingestion.md#01-s02--import-a-csv-statement) |
| 01-S03 | Add a transaction by hand | [01](01-accounts-and-ingestion.md#01-s03--add-a-transaction-by-hand) |
| 01-S04 | Review possible duplicates | [01](01-accounts-and-ingestion.md#01-s04--review-possible-duplicates) |
| 01-S05 | Record incoming money | [01](01-accounts-and-ingestion.md#01-s05--record-incoming-money) |
| 01-S08 | Authorise a connection (Gmail) | [01](01-accounts-and-ingestion.md#01-s08a--connect-gmail) (3 diagrams, including retrying an email that was not understood) |
| 01-S09 | Be told a connection stopped working | [01](01-accounts-and-ingestion.md#01-s09--detect-a-stale-connection) |
| 02-S02 | Category and tags on a transaction | [02](02-categorization-and-rules.md#02-s02--set-category-and-tags) |
| 02-S02a | List and create categories and tags (supports 02-S02, 03-S02) | [02](02-categorization-and-rules.md#02-s02a--list-and-create-categories-and-tags) |
| 02-S03 | Automatic categorization | [02](02-categorization-and-rules.md#02-s03--categorize-automatically) |
| 02-S05 | Correction remembered | [02](02-categorization-and-rules.md#02-s05--correct-and-remember) |
| 02-S06 | Find uncategorized transactions | [02](02-categorization-and-rules.md#02-s06--clear-the-review-inbox) |
| 03-S02 | A limit per category or tags | [03](03-budgets-and-limits.md#03-s02--create-a-budget-and-see-all-progress) |
| 03-S10 | Week, month, or year budgets | [03](03-budgets-and-limits.md#03-s10--change-a-budgets-period) (2 diagrams, including the day the week starts) |
| 03-S11 | Proportion used, including over 100% | [03](03-budgets-and-limits.md#03-s11--proportion-used) |
| 04-S01a | Open the dashboard (supports 04-S01, 04-S03, 04-S06, 03-S11) | [04](04-dashboard-and-insights.md#04-s01a--open-the-dashboard) |
| 04-S01 | Where last month's money went | [04](04-dashboard-and-insights.md#04-s01--where-last-months-money-went) |
| 04-S03 | Breakdown by tag and category | [04](04-dashboard-and-insights.md#04-s03--breakdown-by-tag-and-category) |
| 04-S06 | Income alongside spending | [04](04-dashboard-and-insights.md#04-s06--income-alongside-spending) |
| 05-S01 | Original currency always shown | [05](05-multi-currency-and-roles.md#05-s01--show-the-original-currency) |
| 05-S02 | The rate behind converted amounts | [05](05-multi-currency-and-roles.md#05-s02--convert-at-the-bccr-rate) |
| 05-S06 | Import keeps its currency | [05](05-multi-currency-and-roles.md#05-s06--import-a-statement-in-its-own-currency) |
| 06-S02 | See and withdraw access | [06](06-security-and-data-control.md#06-s02--see-and-revoke-the-gmail-connection) |
| 07-S01 | Record a holding | [07](07-investments-and-net-worth.md#07-s01--record-a-holding) |
| 07-S02 | Value holdings at market prices | [07](07-investments-and-net-worth.md#07-s02--value-holdings-at-current-prices) |
| 07-S02a | Open the portfolio overview (supports 07-S02, 07-S04, 07-S05) | [07](07-investments-and-net-worth.md#07-s02a--open-the-portfolio-overview) |
| 07-S03 | Describe broker fees | [07](07-investments-and-net-worth.md#07-s03--describe-a-brokers-fees) |
| 07-S04 | Record a contribution with fees | [07](07-investments-and-net-worth.md#07-s04--record-a-contribution-with-commissions) |
| 07-S05 | What I would receive if I sold today | [07](07-investments-and-net-worth.md#07-s05--value-if-sold-today) |

## Not covered in this iteration (backlog)

These stories describe capabilities the current design does not include. They have no
sequence diagram and are carried into the product backlog.

| Story | Title | What the design lacks |
|---|---|---|
| 01-S01 | Connect an account | Split story; replaced by 01-S07 to 01-S09 |
| 01-S06 | All accounts and balances | Accounts are registered (01-S02a), but their balances are not tracked |
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
- Parsing uses **bank templates only**, for two banks: **BAC Credomatic and Banco Nacional**
  (one statement export and one card alert email each). Their exact formats, with redacted
  samples and expected results, are in [Bank Formats](../bank-formats.md). There is no LLM
  fallback and no user column mapping.
- Statement rows that move money between the user's own accounts are imported as
  `transfer` and stay out of spending: a BAC `TEF A : <number>` whose number appears in the
  IBAN of an account the user registered, or a SINPE received from the statement's own holder.
  Transfers and SINPE payments to other people still count.
- The only "connection" is the **Gmail script**. Bank connection APIs are out of scope.
- Each broker has a **fee schedule**: deposit, withdrawal, and buy and sell fees per asset
  class (stocks and ETFs, or crypto), each a flat amount plus a percentage. It pre-fills the
  commission of every investment transaction (deposits can be grossed up from the amount
  that arrived), the user can override it, and it prices the "if I sold today" estimate
  including the withdrawal fee.
- Market prices come from the **Yahoo Finance chart API** (no key), with Twelve Data as an
  optional fallback. Quotes in other currencies are converted with Yahoo's exchange rate.
- **Screens are part of the design.** The one-pagers state figures; the design also fixes
  how each page presents them: which is a headline number, which is a chart and of what
  kind, what an empty page says, and the wording. The dashboard opens on the current month
  (or the latest one with data), so "last month" in 04-S01 is one step back.
- **Categories, tags, and settings are managed on a Settings page.** A fixed list of
  sixteen categories is seeded for everyone, users add their own categories and tags, and
  the week-start day is a setting. Renaming, archiving, and ordering stay in the backlog.
