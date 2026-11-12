# Product Backlog

This is the product backlog for the third phase of Finance App. It is deliberately short: it
lists only the main items needed to finish the application after the second deliverable,
in priority order, groups them into two releases, and ends with the plan for a hypothetical
first sprint. Stories removed from the design that are not listed here stay in
[`requirements-changes.md`](requirements-changes.md#removed-from-scope) and can be added
back when they are needed.

## 1. How the backlog is written

The backlog follows Sommerville, *Engineering Software Products* (chapters 2 and 3) and
*Software Engineering*, 10th edition (chapters 3, 23).

- **Types.** Each item is a *Feature* (a user story, with its 1-pager ID such as `01-S06`),
  a *Feature change* (the design does not meet that story's acceptance criteria; it takes
  the next unused number in its 1-pager), or an *Engineering improvement* (`TECH-nn`: work
  that adds no functionality but that the product needs to be built, deployed, or
  trusted). Identifiers are never reused.
- **Stories** use the format *As \<persona\>, I want to \<do something\> so that I can
  \<reason\>*, fit in one sprint (anything sized 13 is split, as in
  [`sizing.md`](sizing.md#splitting)), and have acceptance criteria that can each be tested.
- **States.** *Ready for implementation* (detailed enough to estimate and build),
  *ready for refinement* (important, but something is missing, and the item says what), and
  *ready for consideration* (a tentative idea).
- **Priority.** The two team members prioritize together, with the personas standing in for
  customers. Rank follows value to the vision (figures that are correct and traceable),
  then dependencies, then risk, then cost.
- **Estimates** are story points on the scale 1, 2, 3, 5, 8, 13, relative to the baseline
  **01-S03 = 2 points** ([`sizing.md`](sizing.md)). 01-S06 was re-estimated from 3 to 5: a
  balance includes transfers and card payments, which the spending rollups leave out, and
  BN statements print no balance, so a starting balance must be entered.
- **Definition of Ready.** In the *ready for implementation* state, with a persona, a want,
  a reason, testable criteria, an estimate of at most 8, every dependency done, and any
  sample or decision it needs available.
- **Definition of Done.** *Designed* (sequence diagram, class diagram, routes table, and
  section 2d updated, every Mermaid block renders); *reviewed* by the other team member
  through a pull request; *unit tested* (including the golden tests on the bank samples);
  *integrated* (merged, and the three stacks deploy to AWS); *accepted* (each criterion
  checked on the deployed app). Every item also keeps the product-wide rules: nothing logs
  amounts, merchants, account numbers, or email bodies; money is integer minor units; every
  new page has loading, empty, and error states and works at 360 px wide.

## 2. Where the items come from

| Source | Items |
|---|---|
| In-scope stories whose acceptance criteria the design does not meet | `01-S10` and `07-S07` (no route to delete a transaction or an investment transaction), `03-S15` (no route to delete a budget), `01-S11` (both statement samples are USD exports) |
| Stories removed from the design | `01-S06`, `07-S06`, `04-S04`, `05-S03`, `03-S13`, `02-S04`, `06-S04` |
| What the three iterations showed | `TECH-01` (two Mermaid syntax errors reached `main`), `TECH-02` (signed-in flows were only checked by hand), `TECH-07` (agent B's web stack failed twice on the SSM parameter that `cdk-nextjs` creates), `TECH-08` (the Portfolio page, which lists brokers and holdings, shows "This page could not load" with minified React error #441) |

Gaps found in the review of iteration 3's generated application are added as they are
confirmed, ranked with the rest.

## 3. Ordered product backlog

| Rank | ID | Type | Title | Persona | Points | State | Depends on |
|---|---|---|---|---|---|---|---|
| 1 | [01-S10](#01-s10--delete-a-transaction) | Feature change | Delete a transaction entered by mistake | Daniela | 2 | Implementation | — |
| 2 | [07-S07](#07-s07--remove-an-investment-transaction) | Feature change | Remove an investment transaction | Ezequiel | 2 | Implementation | — |
| 3 | [01-S06](#01-s06--every-account-and-its-balance) | Feature | See every account and its balance | Ezequiel | 5 | Implementation | — |
| 4 | [07-S06](#07-s06--accounts-and-holdings-in-one-total) | Feature | See accounts and holdings in one total | Ezequiel | 3 | Implementation | 01-S06 |
| 5 | [04-S04](#04-s04--see-the-transactions-behind-a-figure) | Feature | See the transactions behind any figure | Daniela | 5 | Implementation | — |
| 6 | [TECH-01](#tech-01--checks-on-every-pull-request) | Engineering improvement | Checks on every pull request | Team | 3 | Implementation | — |
| 7 | [TECH-08](#tech-08--the-portfolio-page-loads) | Engineering improvement | The portfolio page loads | Team | 2 | Refinement | — |
| 8 | [TECH-02](#tech-02--signed-in-checks-on-the-deployment) | Engineering improvement | Signed-in checks on the deployment | Team | 5 | Implementation | — |
| 9 | [TECH-07](#tech-07--the-web-stack-deploys-the-first-time) | Engineering improvement | The web stack deploys the first time | Team | 2 | Implementation | — |
| 10 | [03-S15](#03-s15--delete-a-budget) | Feature change | Delete a budget | Keisy | 2 | Implementation | — |
| 11 | [05-S03](#05-s03--pair-the-two-sides-of-a-transfer) | Feature | Pair the two sides of a transfer | Ezequiel | 8 | Implementation | — |
| 12 | [03-S13](#03-s13--in-app-budget-warning) | Feature | In-app budget warning | Daniela | 3 | Implementation | — |
| 13 | [02-S04](#02-s04--create-and-order-rules) | Feature | Create and order rules | Ezequiel | 5 | Implementation | — |
| 14 | [06-S04](#06-s04--export-all-data) | Feature | Export all my data | Patricia | 5 | Implementation | — |
| 15 | [01-S11](#01-s11--import-colones-statements) | Feature change | Import colones statements | Patricia | 3 | Refinement | — |

**15 items, 55 points:** 7 features, 4 feature changes, and 4 engineering improvements.
"State" is shortened to the last word. Rank and state are separate: `TECH-08` and `01-S11`
rank high while still being refined.

## 4. Release plan

The releases are provisional: how many sprints each takes is worked out once the first
sprint has measured the team's velocity.

| Release | Theme | Ranks | Points |
|---|---|---|---|
| 1 | **Correct and traceable figures.** Mistakes can be removed, every figure opens to its transactions, balances and net worth exist, the Portfolio page works, and every pull request and deployment is checked | 1–10 | 31 |
| 2 | **Complete records and control.** Transfers are paired, budgets warn, rules can be created, data can be exported, and colones statements come in | 11–15 | 24 |

## 5. Items

### Ready for implementation

#### 01-S10 — Delete a transaction

**As** Daniela, **I want to** delete a transaction I entered by mistake **so that I can**
keep a typo out of my totals and budgets.

- A transaction can be deleted from its edit dialog, after a confirmation that names its
  amount, merchant, and date.
- Deleting it subtracts it from every rollup and budget it counted in, in the same
  `TransactWriteItems` as the delete and with the same `version` condition as an edit.
- A deleted transaction that came from a Gmail alert or a statement row is not created
  again when the same email or row arrives again.
- The transaction list and the dashboard no longer show it, without a page reload.

**Design to add.** `DELETE /api/transactions/{id}`, `TransactionService.delete`, and a
sequence diagram. The row fingerprint (`ROWFP#`) and message (`MSG#`) items are kept, which
is what stops the re-import. **Size.** Equal to the anchor: the save path run in reverse.

#### 07-S07 — Remove an investment transaction

**As** Ezequiel, **I want to** remove an investment transaction I recorded by mistake
**so that I can** keep it out of my holdings, cost, and broker cash.

- Removing a deposit, withdrawal, buy, or sell reverses its effect on the holding and on
  the broker's cash.
- Removing an older trade recomputes the average cost of later sales, as a correction
  does. A removal that would leave a later sale larger than the holding is refused, and
  the message names that sale.
- The portfolio's value, cost, and "if I sold today" figures change at once.

**Design to add.** `DELETE /api/investments/transactions/{id}` and
`InvestmentService.remove`, reusing the correction path of 07-S01. **Size.** Equal to the
anchor.

#### 01-S06 — Every account and its balance

**As** Ezequiel, **I want to** see every account I hold and its current balance in one
list **so that I can** know where my money is without opening three banking applications.

- Accounts from both banks appear in one list, each with its balance in its own currency,
  and a USD total that states the BCCR rate and rate date used for colones accounts.
- A balance comes from the last balance printed in an imported BAC statement, or from a
  starting balance and date the user enters (BN statements print none), plus every
  transaction after it, including transfers and card payments.
- Each balance shows when it was last updated and from what: a statement, an entered
  balance, or transactions since.
- A balance whose account has received nothing for longer than its Gmail connection's stale
  period is marked stale.

**Design to add.** An `ACCOUNT#<id>#BAL` rollup written in the save path for every kind;
`balanceCents` read from the BAC template's `Balance de Transacción` column; a starting
balance in the account dialog; an Accounts section on the dashboard.

#### 07-S06 — Accounts and holdings in one total

**As** Ezequiel, **I want to** see my accounts and my holdings in one total **so that I
can** answer what I am worth without adding two numbers from two places.

- One figure adds the account balances of 01-S06 to the "if I sold today" value of 07-S05,
  in USD.
- The figure states the BCCR rate and date for colones balances and the market time of the
  prices for holdings.
- Both parts stay visible on their own and each opens to its accounts or holdings.
- If any balance or price in it is stale, the total says so and gives the oldest age.

**Design to add.** A net worth headline on the dashboard and the portfolio, read from the
account rollups and `ValuationService.liquidation`. No projection of future value is shown.

#### 04-S04 — See the transactions behind a figure

**As** Daniela, **I want to** open a part of a chart and see the transactions behind it
**so that I can** find out what made a number look wrong.

- Every bar, segment, and row on the dashboard and the budgets page opens the transaction
  list filtered to that category, tag, budget, or month.
- The list keeps the same period and filters, and shows a total that equals the figure
  that was opened, to the cent.
- Each element is a link, so it works by tap and by keyboard, with no hover.
- The list appears within 500 ms.

**Design to add.** Filter parameters on `GET /api/transactions` (`categoryId`, `tagId`,
`budgetId`, `kind`, date range) and a filter bar on the transactions page.

#### TECH-01 — Checks on every pull request

**As** the team, **we want** every pull request checked automatically **so that** a broken
diagram or a failing test cannot reach `main`.

- A GitHub Actions workflow runs on every pull request: type checks, unit tests, the golden
  tests on the four bank samples, `cdk synth` of the three stacks, and a render of every
  Mermaid block under `docs/`.
- A failing check blocks the merge, and the workflow needs no AWS credentials.

**Why now.** Two Mermaid syntax errors reached `main` before PR #2 fixed them, and every
later item adds diagrams.

#### TECH-02 — Signed-in checks on the deployment

**As** the team, **we want** a script that runs the signed-in flows against a deployment
**so that** "deployed" means the app works, not only that the stacks exist.

- The script signs in as a test user and follows the demo path: register the BAC and BN
  accounts, import the BAC sample, add a colones expense, save a rule, create a budget,
  read the dashboard, add a broker, deposit, buy, and read the valuation.
- It checks the figures against the expected results in
  [`bank-formats.md`](diagrams/bank-formats.md), prints pass or fail for each step, and
  removes what it created.
- It opens the Portfolio page, so a failure like `TECH-08` is caught.

**Why.** In iterations 1 and 2, agent B's deployments were checked only for `401`
responses, and the signed-in flows of both agents were checked by hand.

#### TECH-07 — The web stack deploys the first time

**As** the team, **we want** the web stack to deploy without manual cleanup **so that** a
fresh build can be deployed in one attempt.

- The architecture diagram states how the web stack avoids the SSM parameter that
  `cdk-nextjs` creates, which the account's CloudFormation policy does not allow.
- A deployment of all three stacks into an empty prefix succeeds the first time.
- The architecture notes say how to recover a stack left in `ROLLBACK_FAILED` or
  `DELETE_FAILED`.

#### 03-S15 — Delete a budget

**As** Keisy, **I want to** delete a budget I no longer keep **so that I can** stop seeing
progress against something I have stopped watching.

- A budget can be deleted after a confirmation; its period and day rollups are removed.
- No transaction, category, tag, or other budget changes.

**Design to add.** `DELETE /api/budgets/{id}` and `BudgetService.delete`.

#### 05-S03 — Pair the two sides of a transfer

**As** Ezequiel, **I want to** pair the two sides of a transfer between my own accounts
**so that I can** stop my own money moving around being counted as spending, even when the
two sides are in different currencies.

- When a transfer leaves one of the user's accounts, the review inbox proposes its other
  side: the same amount, or for USD to CRC an amount within 2% of the BCCR conversion,
  within 3 days.
- Confirming a pair keeps both sides out of spending and links them so each shows the other.
- A movement the IBAN rule did not recognise can be paired by hand; nothing is kept out of
  spending on a probable match alone.
- A pair the user declines is not proposed again.

**Design to add.** A `transferPairId` on both transactions, a pairing step in the review
inbox, and a sequence diagram. The 2% and 3-day limits are a first guess to confirm.

#### 03-S13 — In-app budget warning

**As** Daniela, **I want to** be warned in the app when I am running down a budget **so
that I can** change what I do while it still makes a difference.

- Each budget has a warning threshold, 80% by default, that the user can change or switch
  off without switching off the budget.
- Once spending crosses it, the dashboard and the budgets page show a warning with the
  amount left and the days remaining in the period.
- At most one warning per budget per period; dismissing it hides it until the next period.

**Design to add.** A `warnAtBps` field on the budget and a `warnedPeriod` marker written in
the save path when a period crosses it. Warnings by push notification are left out.

#### 02-S04 — Create and order rules

**As** Ezequiel, **I want to** create a rule that files matching transactions
automatically **so that I can** stop answering the same question about the same merchant
every month.

- A rule matches on merchant (exact or containing a text), amount range, account, or a
  combination, and sets a category, tags, a kind, or several.
- A Rules page lists rules in the order they apply; they can be reordered, edited, switched
  off, and deleted.
- The same transaction and the same rules always give the same result, and the transaction
  shows which rule filed it.
- No rule changes a category the user set by hand.

**Design to add.** Today a rule is one `RULE#<merchantKey>` item per merchant. Ordered
rules with conditions need a new item shape and a new matcher in `CategorizationService`.

#### 06-S04 — Export all data

**As** Patricia, **I want to** take all my data out in a format I can open elsewhere **so
that I can** leave whenever I choose without losing what I have recorded.

- One action on the Settings page downloads a ZIP with one CSV per type: transactions,
  accounts, categories, tags, budgets, rules, brokers, and investment transactions.
- Each CSV opens in a spreadsheet application without conversion (UTF-8 with a byte order
  mark, ISO dates, decimal amounts).
- Transactions include the original amount and currency, the USD amount, and the rate and
  rate date.
- The download link expires.

### Ready for refinement

#### TECH-08 — The portfolio page loads

**As** the team, **we want** the Portfolio page, where brokers and holdings are listed, to
load **so that** the portfolio views, and the net worth figure that 07-S06 adds to them,
can be used at all.

- Opening the Portfolio page with at least one broker, and with none, shows the page and
  not the error screen "This page could not load".
- The cause is found in a non-minified (development) build, where React gives the full
  message instead of "Minified React error #441", and is written in the notes of this item.
- A test, or a step of `TECH-02`'s signed-in checks, opens the Portfolio page and fails if
  the error screen appears.
- A failure inside the page shows the page's own error state rather than replacing the
  whole screen.

**Found.** In the review of iteration 3's generated application, the Portfolio page showed
the error screen with "Minified React error #441; visit https://react.dev/errors/441 for
the full message". The cause is not yet known. **Missing:** the full message from a
development build, and whether the failure depends on the data (no brokers, or a holding
with a missing price) or happens always.

#### 01-S11 — Import colones statements

**As** Patricia, **I want to** import the colones statements of my BAC and BN accounts
**so that I can** bring in my colones spending the same way as my dollar spending.

- The colones exports of both banks are imported, kept in CRC, and converted at the BCCR
  rate of each row's date.
- Golden tests run each new sample through its template.

*Missing:* redacted real samples of both exports, with their expected results.

## 6. First sprint

### Sprint goal

> **Show where my money is, and let every figure on the dashboard be checked and
> corrected.**

It is met when, on the deployed app:

1. each registered account shows a balance and where the balance came from;
2. the dashboard and the portfolio show a net worth figure, with its two parts;
3. every figure on the dashboard and the budgets page opens to a list of transactions whose
   total equals it;
4. a transaction and an investment transaction can each be removed, and every figure they
   counted in changes; and
5. a pull request that breaks a diagram or a test cannot be merged.

### Length and capacity

- **Length:** two weeks, fixed. Anything unfinished returns to the product backlog.
- **Forecast:** about **20 points**. The team has no velocity yet, so the two smallest items
  (01-S10 and 07-S07) are done first to measure it. The points finished at the end become
  the velocity for the second sprint.
- **Mid-sprint check.** If about half the points (10) are not done halfway through, the
  lowest-ranked selected item returns to the backlog.

### Selected items and sprint backlog

The six highest-ranked items, all serving the goal. Team members sign up for tasks (4 to 16
hours each) rather than having them assigned.

| Rank | ID | Title | Points | Tasks | Hours |
|---|---|---|---|---|---|
| 1 | 01-S10 | Delete a transaction | 2 | Class diagram and section 2d; sequence diagram; route, service method, and button; rollup and re-import tests; check on the deployment | 26 |
| 2 | 07-S07 | Remove an investment transaction | 2 | Class diagram; sequence diagram with the refused removal; route and service method; tests for an older buy and the refused case; check on the deployment | 26 |
| 3 | 01-S06 | See every account and its balance | 5 | Balance rollup design; BAC balance column in `bank-formats.md`; dialog and Accounts section design; sequence diagram; rollup and template build; dialog and section build; golden and unit tests; check on the deployment | 64 |
| 4 | 07-S06 | See accounts and holdings in one total | 3 | Net worth headline design; sequence diagram; build; stale balance and price tests; check on the deployment | 30 |
| 5 | 04-S04 | See the transactions behind any figure | 5 | Filter parameters in the class diagram; filter bar and links design; sequence diagram; query filters; filter bar and links; total-equals-figure tests; check on the deployment | 54 |
| 6 | TECH-01 | Checks on every pull request | 3 | Workflow; Mermaid render step; required check on `main`, tested with a broken diagram | 16 |
| | | **Total** | **20** | | **216** |

### How the team runs the sprint

There is no separate Product Owner or ScrumMaster. The daily meeting is a short written
update in a shared chat (done, next, blocked), since the two members take classes at
different times. At the sprint review the team checks the five goal conditions on the
deployed app, adds the problems it found to the backlog, and reviews its way of working.

### Considered and left out

- **05-S03, pairing transfers (8 points).** The most valuable item after the selected ones,
  but more than a third of a forecast that has never been measured. First candidate for
  the second sprint.
- **TECH-08, the portfolio page loads (2 points).** Should be reproduced early in the
  sprint, since 07-S06 adds to that page; if the cause is small it is pulled in.
- **03-S15, deleting a budget (2 points).** The first item to pull in if the team finishes
  early.
