# Product Backlog

This is the product backlog for the third phase of Finance App: every item needed to finish
the application after the second deliverable. It lists the stories removed from the design
([`requirements-changes.md`](requirements-changes.md#removed-from-scope)), the parts of
in-scope stories that the design does not meet, and the technical work and investigations
that the three design iterations showed are needed. It groups the items into releases and
ends with the plan for a hypothetical first sprint.

## 1. How the backlog is written

The backlog follows the recommendations of the course textbooks: Sommerville, *Engineering
Software Products* (chapter 2, product backlogs and sprints; chapter 3, user stories), and
Sommerville, *Software Engineering*, 10th edition (chapter 3, user stories and Scrum;
chapter 23, agile planning).

### What goes in it

The product backlog is the list of what needs to be done to complete the product, and it
is always kept in priority order, with the items to be implemented first at the top. Its
items are not only features. The textbook names four kinds of product backlog item, and
each item here is labelled with one:

| Type | What it is | IDs |
|---|---|---|
| Feature | A capability for a user, written as a user story | 1-pager IDs (`01-S06`, …) |
| Feature change | A change to a feature the design already has, where the design does not meet that story's acceptance criteria | New 1-pager IDs (`01-S10`, …) |
| Engineering improvement | Work that adds no functionality but that the product needs to be built, deployed, or trusted: tooling, testing, operations, and non-functional requirements | `TECH-nn` |
| Development activity | Work the team must do that is not code, such as an investigation whose answer an estimate depends on. The textbook asks that these be backlog items rather than work that silently uses the team's time | `SPIKE-nn` |

Stories carried over from the 1-pagers keep their identifier. New stories take the next
unused number in their 1-pager, as [`sizing.md`](sizing.md#splitting) requires, and
identifiers are never reused.

### How stories are written

- Every story uses the textbook format with its reason: *As \<persona\>, I want to \<do
  something\> so that I can \<reason\>*. The reason is kept because it tells the reader
  what the persona is trying to do, which the textbook says helps where developers are
  unfamiliar with the users' work.
- Every story covers one feature, or one part of a feature, that can be built within a
  single sprint. A story that would take several sprints is an epic and is broken down
  before it is planned; here, any story sized at 13 is split, as in
  [`sizing.md`](sizing.md#splitting).
- Every story has acceptance criteria that can each be tested, and no story is written as a
  negative ("I don't want …"), since a test cannot demonstrate a negative.

### Item states

Each item is in one of the textbook's three states:

| State | Meaning |
|---|---|
| Ready for consideration | A high-level idea that may be included. Tentative: it may change a lot or never be built |
| Ready for refinement | Agreed to be important, with a reasonably clear definition, but work is needed to understand it before it can be estimated reliably (for example, a real bank sample or a decision) |
| Ready for implementation | Detailed enough to estimate and build, with its dependencies on other items identified |

Detail follows rank. Items near the top are written in full; items near the bottom are
coarser and are refined as they rise.

### Grooming

The backlog is reviewed as the first step of every sprint planning, and whenever the team
learns something during a sprint. The review has the textbook's four activities:
**refinement** (items are analysed and made more detailed, sometimes into new items),
**estimation**, **creation** (new features, feature changes, engineering improvements, and
activities are added, such as the gaps found in the iteration 3 review), and
**prioritization** (items are re-ordered).

### Prioritization

The team has no separate product owner, so the two team members prioritize together, with
the personas standing in for the customers. Rank is decided by four things, in this order:

1. **Value to the vision.** The vision names three things existing trackers get wrong:
   counting transfers between one's own accounts as spending, blending currencies, and
   valuing investments without the fees to sell them. Items that make the figures the
   product already shows correct and traceable come first.
2. **Dependencies.** An item that other items need (for example account balances, which
   safe-to-spend, runway, and net worth all read) is ranked above them.
3. **Risk.** Items with structural unknowns (shared budgets, bank APIs, push notifications)
   are preceded by an investigation that reduces the unknown, and are ranked low until it
   does.
4. **Cost.** Between two items of similar value, the smaller one goes first: the textbook
   suggests favouring the items that deliver the most value for the least effort.

### Estimation

Items are estimated in **story points**, the textbook's arbitrary, relative measure that
accounts for a task's size, complexity, technology, and unknowns. The team agreed points for
a baseline task and estimates every other item by comparison with it: **01-S03 = 2 points**,
on the modified Fibonacci scale (1, 2, 3, 5, 8, 13), exactly as in
[`sizing.md`](sizing.md). Story points are used rather than person-days because a point
means the same thing whoever does the work. Stories carried over from the 1-pagers keep
their estimate unless the design changed the work; where it did, the new estimate and its
reason are given in [section 3](#re-estimated-or-split-stories). The textbook warns that
early estimates are inevitably wrong; these are re-estimated as the work is understood.

### Definition of Ready

An item can be taken into a sprint only when:

- it is in the *ready for implementation* state;
- it has a persona, a want, a reason, and acceptance criteria that can each be checked as
  passed or failed;
- it is estimated, and is not larger than 8 points;
- every item it depends on is done;
- the information it needs exists: a parser story has a redacted real sample in
  [`samples/`](samples/) with its expected result, and a story that depends on an
  investigation has that investigation's decision.

### Definition of Done

Each sprint must produce a potentially shippable increment, so the team agrees what "done"
means. It follows the textbook's code completeness checklist, with the design steps this
project requires added in front, since the application is built from the design:

| State | What must be true |
|---|---|
| Designed | The item has a sequence diagram in [`diagrams/sequences/`](diagrams/sequences/) and appears in the index; every new participant and message is in the [class diagram](diagrams/class-diagram.md), every new route in the routes table, and every new page or section in class diagram section 2d. Every changed Mermaid block renders. A departure from the 1-pager is recorded in [`requirements-changes.md`](requirements-changes.md) |
| Reviewed | The design change was reviewed by the other team member and merged into `main` through a pull request; the code was reviewed against the class diagram's names and conventions |
| Unit tested | Unit tests cover each acceptance criterion and run automatically; all pass, including the golden tests on the bank samples |
| Integrated | The code is merged with no integration errors, and the three stacks deploy to AWS |
| Integration tested | The signed-in checks (`TECH-02`, once it exists) pass against the deployment |
| Accepted | Each acceptance criterion was checked on the deployed app, and the team confirmed the item is complete |

Every item also keeps the rules that apply to the whole product: nothing logs amounts,
merchant names, account numbers, or email bodies; money is held as integer minor units;
and every new page has its loading, empty, and error states, works at 360 px wide, and
conveys nothing by colour alone.

### Non-functional requirements

The textbook notes that performance and dependability are system-wide properties that
cannot be delivered story by story. Those that apply to every item are part of the
Definition of Done above. Those that need their own work to meet or to measure are
engineering improvements: performance (`TECH-03`), accessibility and phone width
(`TECH-04`), and TLS 1.3 (`TECH-06`). The rest belong to the story they constrain and appear
in its acceptance criteria: offline entry (`01-S13`), warning timeliness (`03-S14`), and the
deletion service level (`06-S05`), for example.

## 2. Where the items come from

| Source | Items |
|---|---|
| Stories removed from the design ([`requirements-changes.md`](requirements-changes.md#removed-from-scope), [sequence index](diagrams/sequences/README.md#not-covered-in-this-iteration-backlog)) | The 25 stories in that list. Split parents `01-S01` and `03-S05` are tracked through the stories that replace them, as in [`sizing.md`](sizing.md#splitting) |
| In-scope stories whose acceptance criteria the design does not meet | `01-S10` and `07-S07` (no route to delete a transaction or remove an investment transaction; 07-S01 asks that holdings can be removed), `03-S15` (no route to delete a budget), `02-S08` (rules apply only from now on; 02-S05 asks for past transactions too), `02-S09` (renaming and archiving were left out of the Settings page), `05-S07` (the user cannot choose the display currency; 05-S02 asks for it), `01-S12` (no column mapping for other banks; 01-S02 asks for it), `01-S13` (offline entry was removed) |
| Gaps in the bank formats | `01-S11` (both statement samples are USD exports; no colones statement has been read), `01-S14` (only the purchase alert of each bank is specified), `07-S08` (a transfer to a broker in a bank statement and the deposit at the broker are recorded separately) |
| What the three iterations showed | `TECH-01` (two Mermaid syntax errors reached `main` before PR #2), `TECH-02` (signed-in flows were only checked by hand; agent B's deployments were only checked for `401`), `TECH-07` (agent B's web stack failed in both iterations on the SSM parameter that `cdk-nextjs` creates, ending in `DELETE_FAILED` and `ROLLBACK_FAILED`), `TECH-08` (the Portfolio page, which lists brokers and holdings, shows "This page could not load" with minified React error #441) |
| Non-functional requirements not yet met or not yet measured | `TECH-03`, `TECH-04`, `TECH-05`, `TECH-06` |
| Unknowns that block estimates | `SPIKE-01` (push notifications), `SPIKE-02` (bank connection APIs) |

The textbook warns that stories derived from scenarios are never a complete description of a
feature: its example set of stories for a feature has none for deleting or changing what was
created. The 1-pagers had the same gap, which is where `01-S10`, `03-S15`, `07-S07`, and
`02-S09` come from.

Gaps found in the review of iteration 3's generated application are added to this backlog
as they are confirmed (the *creation* activity of grooming), ranked with the rest.

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
| 8 | [03-S15](#03-s15--delete-a-budget) | Feature change | Delete a budget | Keisy | 2 | Implementation | — |
| 9 | [05-S03](#05-s03--pair-the-two-sides-of-a-transfer) | Feature | Pair the two sides of a transfer | Ezequiel | 8 | Implementation | — |
| 10 | [03-S13](#03-s13--in-app-budget-warning) | Feature | In-app budget warning | Daniela | 3 | Implementation | — |
| 11 | [02-S04](#02-s04--create-and-order-rules) | Feature | Create and order rules | Ezequiel | 5 | Implementation | — |
| 12 | [02-S08](#02-s08--apply-a-correction-to-past-transactions) | Feature change | Apply a correction to past transactions | Ezequiel | 3 | Implementation | — |
| 13 | [06-S04](#06-s04--export-all-data) | Feature | Export all my data | Patricia | 5 | Implementation | — |
| 14 | [TECH-02](#tech-02--signed-in-checks-on-the-deployment) | Engineering improvement | Signed-in checks on the deployment | Team | 5 | Implementation | — |
| 15 | [TECH-07](#tech-07--the-web-stack-deploys-the-first-time) | Engineering improvement | The web stack deploys the first time | Team | 2 | Implementation | — |
| 16 | [04-S02](#04-s02--compare-a-period-with-the-ones-before-it) | Feature | Compare a period with the ones before it | Ezequiel | 5 | Implementation | — |
| 17 | [02-S07](#02-s07--see-and-undo-what-rules-filed) | Feature | See and undo what rules filed | Keisy | 3 | Implementation | 02-S04 |
| 18 | [02-S09](#02-s09--rename-and-archive-categories-and-tags) | Feature change | Rename and archive categories and tags | Keisy | 3 | Implementation | — |
| 19 | [07-S08](#07-s08--link-a-bank-payment-to-a-broker-deposit) | Feature | Link a bank payment to a broker deposit | Ezequiel | 3 | Refinement | — |
| 20 | [01-S11](#01-s11--import-colones-statements) | Feature change | Import colones statements | Patricia | 3 | Refinement | — |
| 21 | [06-S03](#06-s03--lock-the-app-when-idle) | Feature | Lock the app when idle | Ezequiel | 3 | Implementation | — |
| 22 | [06-S06](#06-s06--recover-the-account) | Feature | Recover the account after losing the phone | Daniela | 5 | Implementation | 06-S03 |
| 23 | [06-S05](#06-s05--delete-all-my-data) | Feature | Delete all my data | Patricia | 8 | Refinement | — |
| 24 | [TECH-03](#tech-03--measure-the-performance-requirements) | Engineering improvement | Measure the performance requirements | Team | 5 | Implementation | — |
| 25 | [TECH-04](#tech-04--accessibility-and-phone-width) | Engineering improvement | Accessibility and phone width | Team | 3 | Implementation | — |
| 26 | [TECH-05](#tech-05--operational-alarms) | Engineering improvement | Operational alarms | Team | 3 | Implementation | — |
| 27 | [03-S06](#03-s06--confirm-commitments) | Feature | Confirm which recurring costs are commitments | Ezequiel | 5 | Implementation | — |
| 28 | [03-S03](#03-s03--safe-to-spend) | Feature | See how much I can safely spend | Andrés | 8 | Implementation | 01-S06, 03-S06 |
| 29 | [03-S04](#03-s04--runway) | Feature | See how long my money lasts | Andrés | 5 | Implementation | 01-S06 |
| 30 | [03-S12](#03-s12--year-end-saving) | Feature | See what keeping my budgets saves by year end | Keisy | 5 | Implementation | — |
| 31 | [05-S04](#05-s04--account-roles) | Feature | Give each account a role | Ezequiel | 3 | Implementation | 01-S06 |
| 32 | [05-S05](#05-s05--conversion-cost) | Feature | See what a currency conversion cost me | Ezequiel | 5 | Implementation | 05-S03 |
| 33 | [05-S07](#05-s07--read-totals-in-colones) | Feature change | Read totals in colones | Ezequiel | 8 | Refinement | — |
| 34 | [SPIKE-01](#spike-01--push-notifications-on-phone-browsers) | Development activity | Push notifications on phone browsers | Team | 2 | Implementation | — |
| 35 | [03-S14](#03-s14--budget-warning-by-push) | Feature | Budget warning by push notification | Daniela | 3 | Consideration | SPIKE-01, 03-S13 |
| 36 | [02-S01](#02-s01--be-asked-at-the-time-of-the-charge) | Feature | Be asked at the time of the charge | Ezequiel | 8 | Consideration | SPIKE-01 |
| 37 | [06-S01](#06-s01--no-prompts-to-connect) | Feature | Use everything without being asked to connect | Patricia | 2 | Implementation | — |
| 38 | [01-S12](#01-s12--import-from-any-bank-with-a-column-mapping) | Feature change | Import from any bank with a column mapping | Patricia | 8 | Refinement | — |
| 39 | [01-S13](#01-s13--add-a-transaction-offline) | Feature change | Add a transaction offline | Daniela | 5 | Refinement | — |
| 40 | [01-S14](#01-s14--read-more-alert-types) | Feature | Read refund, reversal, and withdrawal alerts | Ezequiel | 3 | Refinement | — |
| 41 | [03-S07](#03-s07--invite-a-partner-to-a-budget) | Feature | Invite a partner to a budget | Patricia | 5 | Consideration | — |
| 42 | [03-S08](#03-s08--who-paid-in-a-shared-budget) | Feature | See who paid in a shared budget | Patricia | 3 | Consideration | 03-S07 |
| 43 | [03-S09](#03-s09--end-sharing) | Feature | End sharing | Patricia | 5 | Consideration | 03-S07 |
| 44 | [04-S05](#04-s05--household-split-by-person) | Feature | See household spending split by person | Patricia | 3 | Consideration | 03-S08 |
| 45 | [SPIKE-02](#spike-02--bank-connection-apis) | Development activity | Bank connection APIs | Team | 3 | Implementation | — |
| 46 | [01-S07](#01-s07--which-institutions-can-be-connected) | Feature | See which institutions can be connected | Ezequiel | 3 | Consideration | SPIKE-02 |
| 47 | [01-S15](#01-s15--connect-a-bank-that-offers-an-api) | Feature | Connect a bank that offers an API | Ezequiel | 8 | Consideration | SPIKE-02 |
| 48 | [TECH-06](#tech-06--tls-13-and-a-custom-domain) | Engineering improvement | TLS 1.3 and a custom domain | Team | 3 | Consideration | — |

**48 items, 202 points:** 29 features, 9 feature changes, 8 engineering improvements, and 2
development activities. "State" is shortened to the last word: *Implementation* means ready
for implementation, and so on. Rank and state are separate: an item can rank high while it
is still being refined, as `07-S08` and `01-S11` are.

### Re-estimated or split stories

| Story | 1-pager size | Now | Why |
|---|---|---|---|
| 01-S06 | 3 | 5 | A balance includes transfers and card payments, which the spending rollups leave out, so it needs a per-account rollup of every kind. BAC statements print a balance, which the template currently ignores; BN statements print none, so a starting balance must be entered |
| 03-S01 | 5 | Split | Split by delivery channel into 03-S13 (in the app, 3) and 03-S14 (by push, 3), so the warning can ship before push notifications exist. 03-S01 keeps no estimate, like the other split parents |
| 05-S07 | (05-S02, 5) | 8 | Every rollup is kept in USD. Totals in colones that do not change on a later date need each transaction converted at its own date's rate, which means a second set of rollups, not a conversion at display time |
| 06-S01 | 3 | 2 | The design already works without any connection: Gmail is optional and statements and manual entry cover every view. What remains is not prompting again after a refusal and saying at the point of use what needs a connection |

## 4. Release plan

Agile planning has two stages in the textbook: release planning, which looks months ahead
and decides which features go in each release, and iteration planning, which plans the next
sprint. The releases below group the ordered backlog into themes. They are provisional:
how many sprints each one takes is worked out only once the first sprint has measured the
team's velocity, and stories are added to or removed from a release until its estimate fits
the date chosen for it.

| Release | Theme | Ranks | Points |
|---|---|---|---|
| 1 | **Correct and traceable figures.** Mistakes can be removed, every figure opens to its transactions, balances and net worth exist, transfers are paired, rules can be managed, data can be exported, and every pull request and deployment is checked | 1–18 | 66 |
| 2 | **Complete records and control of my data.** Colones statements and broker deposits come in, the app locks and can be recovered, data can be deleted, and the non-functional requirements are measured and monitored | 19–26 | 33 |
| 3 | **Planning ahead.** Commitments, safe-to-spend, runway, the year-end saving figure, account roles, conversion cost, and totals in colones | 27–33 | 39 |
| 4 | **Reaching the user, sharing, and more sources.** Push notifications, prompts at the time of a charge, any bank's statements, offline entry, more alert types, shared household budgets, bank APIs, and TLS 1.3 | 34–48 | 64 |

Release 4 holds most of the items still waiting on an investigation (`SPIKE-01`,
`SPIKE-02`) or on an account that allows what they need. If an investigation says an item
cannot be built, that item is removed from the backlog rather than kept.

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
`InvestmentService.remove`, reusing the correction path of 07-S01. This completes 07-S01,
whose acceptance criteria say holdings can be removed. **Size.** Equal to the anchor.

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
  period is marked stale, as 01-S09 marks the connection.

**Design to add.** An `ACCOUNT#<id>#BAL` rollup written in the save path for every kind;
`balanceCents` read from the BAC template's `Balance de Transacción` column; a starting
balance in the account dialog; an Accounts section on the dashboard. This story unlocks
07-S06, 03-S03, 03-S04, and 05-S04.

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

- Every bar, segment, and row on the dashboard and the budgets page (category and tag
  breakdowns, income against spending, budget cards) opens the transaction list filtered
  to that category, tag, budget, or month.
- The list keeps the same period and filters, and shows a total that equals the figure
  that was opened, to the cent.
- Each element is a link, so it works by tap and by keyboard, with no hover.
- The list appears within 500 ms (non-functional requirement of 1-pager 04).

**Design to add.** Filter parameters on `GET /api/transactions` (`categoryId`, `tagId`,
`budgetId`, `kind`, date range) and a filter bar on the transactions page. This also meets
the "derivation" requirement of 1-pagers 03, 04, and 07 for every total on these pages.

#### TECH-01 — Checks on every pull request

**As** the team, **we want** every pull request checked automatically **so that** a broken
diagram or a failing test cannot reach `main`.

- A GitHub Actions workflow runs on every pull request: type checks, unit tests, the golden
  tests on the four bank samples, `cdk synth` of the three stacks, and a render of every
  Mermaid block under `docs/`.
- A failing check blocks the merge.
- The workflow needs no AWS credentials.

**Why now.** Two Mermaid syntax errors reached `main` before PR #2 fixed them, and every
later item adds diagrams. Running the checks on each pull request costs less than finding
the error in a generated build.

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
  side from the user's other accounts: the same amount, or for USD to CRC an amount within
  2% of the BCCR conversion, within 3 days.
- Confirming a pair keeps both sides out of spending, and links them so each shows the other.
- A movement the IBAN rule did not recognise (for example a SINPE to the user's own account
  at another bank) can be paired by hand; nothing is kept out of spending on a probable
  match alone.
- A pair the user declines is not proposed again.

**Design to add.** A `transferPairId` on both transactions, a pairing step in the review
inbox, and a sequence diagram. The existing IBAN rule stays: an exact IBAN match is not a
probable match. The 2% and 3-day limits are a first guess to confirm with the team.

#### 03-S13 — In-app budget warning

Replaces part of 03-S01 (warnings delivered by push are 03-S14).

**As** Daniela, **I want to** be warned in the app when I am running down a budget **so
that I can** change what I do while it still makes a difference.

- Each budget has a warning threshold, 80% by default, that the user can change or switch
  off without switching off the budget.
- Once spending crosses it, the dashboard and the budgets page show a warning with the
  amount left and the days remaining in the period.
- At most one warning per budget per period; dismissing it hides it until the next period.

**Design to add.** A `warnAtBps` field on the budget and a `warnedPeriod` marker written in
the save path when a period crosses it.

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

**Design to add.** Today a rule is one `RULE#<merchantKey>` item per merchant, created from
a correction. Ordered rules with conditions need a new item shape and a new matcher in
`CategorizationService`.

#### 02-S08 — Apply a correction to past transactions

Completes 02-S05, whose acceptance criteria ask for past transactions as well as future ones.

**As** Ezequiel, **I want to** apply a correction to my past transactions too **so that I
can** fix last month's figures with the same answer.

- When saving a rule from a correction, the user chooses "From now on" or "Also past
  transactions".
- Past application changes only transactions whose category was not set by hand, updates
  their rollups, and reports how many changed.
- Applying it over 5,000 transactions finishes within 5 seconds.

#### 06-S04 — Export all data

**As** Patricia, **I want to** take all my data out in a format I can open elsewhere **so
that I can** leave whenever I choose without losing what I have recorded.

- One action on the Settings page downloads a ZIP with one CSV per type: transactions,
  accounts, categories, tags, budgets, rules, brokers, and investment transactions.
- Each CSV opens in a spreadsheet application without conversion (UTF-8 with a byte order
  mark, ISO dates, decimal amounts).
- Transactions include the original amount and currency, the USD amount, and the rate and
  rate date.
- The export needs no contact with anyone, and its download link expires.

#### TECH-02 — Signed-in checks on the deployment

**As** the team, **we want** a script that runs the signed-in flows against a deployment
**so that** "deployed" means the app works, not only that the stacks exist.

- The script signs in as a test user the team creates once, and follows the demo path:
  register the BAC and BN accounts, import the BAC sample, add a colones expense, save a
  rule, create a budget, read the dashboard, add a broker, deposit, buy, and read the
  valuation.
- It checks the figures against the expected results in
  [`bank-formats.md`](diagrams/bank-formats.md) and prints pass or fail for each step.
- It removes what it created.

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

**Why.** Agent B's web stack failed on that parameter in both iterations. The warning was
in the prompt, not in the diagrams, so a generator that does not follow the prompt closely
still hits it.

#### 04-S02 — Compare a period with the ones before it

**As** Ezequiel, **I want to** compare a period against the ones before it **so that I
can** tell whether this month is unusual or normal for me.

- The dashboard shows this month's spending against each of the three before it, as a
  difference in amount and in percent.
- When fewer than three earlier months have data, it says so.
- The categories that changed most are listed, each with its difference.
- The figures are read from the stored month rollups, not recomputed.

#### 02-S07 — See and undo what rules filed

**As** Keisy, **I want to** see which transactions a rule filed without asking me **so
that I can** undo a rule that turns out to be wrong.

- The transaction list can be filtered to "Filed by a rule", and each transaction names
  the rule.
- Switching off or deleting a rule offers to send the transactions it filed back to the
  review inbox.
- Transactions whose category the user set by hand are never sent back.

The 1-pager's criterion about setting a default from a prompt depends on 02-S01 and moves
with it.

#### 02-S09 — Rename and archive categories and tags

**As** Keisy, **I want to** rename and archive the categories and tags I created **so that
I can** keep the lists I pick from short and current.

- The user's own categories and tags can be renamed; totals and budgets follow, because
  they refer to the id.
- Archiving hides an entry from every picker but keeps it on past transactions and in past
  totals; a budget that targets it shows a notice.
- Built-in categories cannot be renamed, but can be hidden from the pickers.

#### 06-S03 — Lock the app when idle

**As** Ezequiel, **I want to** have the app lock itself **so that I can** hand someone my
phone without handing them my finances.

- An idle session ends after a period the user sets on the Settings page, 15 minutes by
  default.
- Signing in can use a passkey, so the phone's own biometric or passcode unlocks the app
  instead of a separate password.

#### 06-S06 — Recover the account

**As** Daniela, **I want to** get back into my account if I lose my phone **so that I
can** recover without losing everything I have recorded.

- Recovery uses a code sent to the account's email, so it does not need the lost phone.
- Recovery is self-service; no one else sees her data.
- After recovery, passkeys registered on the lost phone can be removed, and a new one set
  up before the app opens.

#### TECH-03 — Measure the performance requirements

**As** the team, **we want** the 1-pagers' performance requirements measured **so that**
we know which ones the design meets.

- A fixture generator creates 5,000 transactions across both currencies and 20 budgets of
  mixed periods.
- The checks measure: a 5,000-row statement import within 10 seconds, any dashboard view
  within 1.5 seconds, budget progress within 1 second of a change, a rule applied to 5,000
  past transactions within 5 seconds, and 100 holdings revalued within 1 second.
- The results are recorded in the design; each requirement that fails becomes a backlog
  item. A 5,000-row statement must also fit the 1 MiB upload limit, which is checked first.

#### TECH-04 — Accessibility and phone width

**As** the team, **we want** every page checked at phone width and for accessibility **so
that** the requirements of 1-pager 04 hold on every page, not only the dashboard.

- Every page is usable at 360 px wide with no horizontal scrolling and no cut-off figures.
- An automated accessibility check runs in `TECH-01`'s workflow and fails on contrast below
  4.5:1 or a missing label.
- No chart conveys information by colour alone.

#### TECH-05 — Operational alarms

**As** the team, **we want** alarms on the failures the product depends on **so that** a
stopped feed is found before a user relies on stale figures.

- CloudWatch alarms on `ApiFn` and `ImportWorkerFn` errors, failed BCCR requests, failed
  price requests, and a rise in rejected Gmail messages, with a dashboard showing them.
- No alarm or log includes an amount, merchant, account number, or email body.
- The account does not allow SNS, so alarms are seen in the console; sending them by email
  waits for an account that allows it.

#### 03-S06 — Confirm commitments

**As** Ezequiel, **I want to** confirm which of my recurring costs are commitments **so
that I can** have them excluded from what I think is free to spend.

- Transactions that repeat from the same merchant at a regular interval are proposed as
  commitments for him to confirm.
- A confirmed commitment is subtracted from safe-to-spend (03-S03) for its period.
- A commitment can be added by hand for something that has not recurred yet.

#### 03-S03 — Safe to spend

**As** Andrés, **I want to** see how much I can safely spend this period **so that I can**
stop guessing in the weeks between client payments.

- The figure is the balance of his spending accounts (01-S06) less the commitments (03-S06)
  still due this period, and never counts income that has not arrived.
- The figure opens to show every amount it subtracted.
- It updates when a payment arrives or a commitment changes.

#### 03-S04 — Runway

**As** Andrés, **I want to** see how long my current money lasts at my current rate of
spending **so that I can** judge how lean a month I am actually in.

- The figure is a date and a number of weeks, with the spending rate it assumes.
- He can choose the period the rate is based on (last 30, 90, or 180 days).
- It is worded as a consequence of current spending, not a forecast of income.

#### 03-S12 — Year-end saving

**As** Keisy, **I want to** see what I would have saved by the end of the year if I stay
inside my budgets **so that I can** tell what keeping to them is actually worth.

- The figure assumes spending exactly to budget for the periods left in the year, plus the
  surplus or deficit so far.
- It says plainly that it assumes she keeps to her budgets and is not a prediction.
- It opens to the budgets and periods it was built from. A quarterly or custom budget
  counts only the part of its periods that falls in the year.

#### 05-S04 — Account roles

**As** Ezequiel, **I want to** give each of my accounts a role **so that I can** have the
product understand that a small spending balance is deliberate rather than a problem.

- Each account has a role he sets: savings, income, or day-to-day spending. None is
  assigned without him choosing it.
- Safe-to-spend (03-S03) uses only spending accounts, and no warning is raised for a small
  balance in a savings account.
- A role can be changed at any time.

#### 05-S05 — Conversion cost

**As** Ezequiel, **I want to** see what a currency conversion actually cost me **so that I
can** know the price of moving my salary into what I spend from.

- For a paired USD to CRC transfer (05-S03), the cost is the difference between the rate
  the bank applied and the BCCR rate on that date.
- The cost is shown on the transfer, and is added up for any period.

#### SPIKE-01 — Push notifications on phone browsers

**Question.** Can the app deliver Web Push to the browsers the personas use (Safari on an
iPhone, which requires the app installed to the home screen, and Chrome on Android), sent
from `ApiFn` without SNS, which the account blocks?

- **Time box.** Two days.
- **Output.** A yes or no for each browser, the infrastructure the design would need, and
  new estimates for 03-S14 and 02-S01.

#### 06-S01 — No prompts to connect

**As** Patricia, **I want to** use every part of the product without linking any account
**so that I can** keep my banking credentials to myself and still get the whole benefit.

- After she declines to connect Gmail once, the app does not ask again.
- Anything that needs a connection says so where it is used, rather than appearing broken.
- No view, total, or budget is reduced because nothing is connected.

#### SPIKE-02 — Bank connection APIs

**Question.** Does any Costa Rican bank the personas use, starting with the BAC developer
portal, give an individual's application access to their own accounts, and on what terms?

- **Time box.** Three days.
- **Output.** A go or no-go for 01-S07 and 01-S15, and a re-estimate of 01-S15 (provisional
  at 8, as [`sizing.md`](sizing.md#how-certain-these-are) already notes).

### Ready for refinement

These items are agreed to be needed but are missing something before they can be estimated
reliably. What each one is missing is stated.

#### 07-S08 — Link a bank payment to a broker deposit

**As** Ezequiel, **I want** a payment to my broker in a bank statement linked to the
deposit at the broker **so that I can** record the money once instead of in two places.

- A statement row whose merchant matches a broker (for example BAC
  `DTR:inversiones_hapi_VT`) is offered as a deposit to that broker, with its fee
  calculated from the schedule.
- Accepting it records the deposit and marks the bank row as a transfer.

*Missing:* which broker names appear in each bank's statements, and whether the match is a
rule (02-S04) or a setting on the broker.

#### 01-S11 — Import colones statements

**As** Patricia, **I want to** import the colones statements of my BAC and BN accounts
**so that I can** bring in my colones spending the same way as my dollar spending.

- The colones exports of both banks are imported and kept in CRC, and converted at the
  BCCR rate of each row's date.
- Golden tests run each new sample through its template.

*Missing:* redacted real samples of both exports, with their expected results.

#### 06-S05 — Delete all my data

**As** Patricia, **I want to** delete my data and know it is gone **so that I can** end my
relationship with the product completely.

- The Settings page lists what will be deleted and how long it takes before she confirms:
  every item under her partition in the five tables, her raw emails and statements in S3,
  her Gmail connection, and her Cognito user.
- The Gmail connection is revoked first, so nothing new arrives during the deletion.
- She is told when the deletion has finished.

*Missing:* a decision on backups. The tables keep point-in-time recovery, and the
1-pager requires deletion from backups within 30 days, so the recovery period must be 30
days or less.

#### 05-S07 — Read totals in colones

Completes 05-S02, whose acceptance criteria let the user choose the display currency.

**As** Ezequiel, **I want to** read my totals in colones **so that I can** compare them
with the amounts I think in for day-to-day spending.

- The display currency is a setting, USD or CRC, and can be changed at any time.
- Each transaction converts at the rate of its own date, so a past total never changes.
- Every converted total names the rate source and the dates of the rates used.

*Missing:* whether a second set of rollups is worth its cost, or whether converting the USD
totals at the end-of-period rate, clearly stated, is enough.

#### 01-S12 — Import from any bank with a column mapping

Completes 01-S02, which asks for column mapping for any bank's file.

**As** Patricia, **I want to** import a statement from a bank without a template **so
that I can** use the product with every bank I have.

- The first import of an unknown layout asks her to map columns to date, amount (or debit
  and credit), description, and currency.
- The mapping is saved and used automatically for the next file with the same columns.
- Rows that cannot be read are reported one by one, and the rest import.

*Missing:* whether a user mapping replaces the need for new templates, and how it interacts
with transfer detection, which depends on bank-specific descriptions.

#### 01-S13 — Add a transaction offline

**As** Daniela, **I want to** add a transaction with no connection **so that I can** record
a cash payment where there is no signal.

- Manual entry works with no network; the entry is saved on the phone and sent when the
  connection returns.
- Saving returns control within 300 ms.
- An entry that fails when it is sent is shown to her with the reason.

*Missing:* how the pages, which are rendered on the server, work offline.

#### 01-S14 — Read more alert types

**As** Ezequiel, **I want** refund, reversal, and cash withdrawal alerts read as well as
purchases **so that I can** trust that every alert my bank sends is counted correctly.

- Each alert type of each bank has a template, and a refund or reversal is recorded as money
  in against the original purchase.

*Missing:* redacted samples of each alert type.

#### TECH-08 — The portfolio page loads

**As** the team, **we want** the Portfolio page, where brokers and holdings are listed, to
load **so that** the portfolio views, and the net worth figure that 07-S06 adds to them,
can be used at all.

- Opening the Portfolio page with at least one broker, and with none, shows the page and
  not the error screen "This page could not load".
- The cause is found in a non-minified (development) build, where React gives the full
  message instead of "Minified React error #441", and is written in the notes of this item.
- A test or a step of `TECH-02`'s signed-in checks opens the Portfolio page and fails if the
  error screen appears.
- The page keeps its loading, empty, and error states; a failure inside it shows the error
  state of the page rather than replacing the whole screen.

**Found.** In the review of iteration 3's generated application, the Portfolio page showed
the error screen with "Minified React error #441; visit https://react.dev/errors/441 for
the full message". The cause is not yet known, so the item is in refinement until it is
reproduced. **Missing:** the full message from a development build, and whether the failure
depends on the data (no brokers, or a holding with a missing price) or happens always.

### Ready for consideration

These items belong in the product but carry structural unknowns. They are refined after the
investigations or decisions they depend on.

#### 03-S14 — Budget warning by push

Replaces the rest of 03-S01.

**As** Daniela, **I want** the budget warning of 03-S13 sent to my phone **so that I can**
see it without opening the app.

- The warning arrives within 15 minutes of the transaction that crossed the threshold.
- A notification shows no amount or merchant on a locked screen unless she turns that on.

#### 02-S01 — Be asked at the time of the charge

**As** Ezequiel, **I want to** be asked which category and tags a charge belongs to at the
time it is charged **so that I can** answer while I still remember what I bought.

- When a Gmail alert arrives for a charge that no rule files, a notification offers the
  categories and tags he uses most; answering takes one tap.
- Dismissing it leaves the charge in the review inbox.
- The prompts can be turned off without affecting anything else.

#### 03-S07 — Invite a partner to a budget

**As** Patricia, **I want to** invite my partner to a budget **so that I can** have us both
working from the same agreed figures.

- An invitation goes to a person she names and takes effect when they accept.
- Accepting shows the budget, its limits, and the transactions attributed to it, and
  nothing else of either person.

The design partitions every item by one user (`PK = USER#<id>`). Sharing is the first case
where one user reads another's items, so this story sets the authorization boundary the
other three sharing stories depend on.

#### 03-S08 — Who paid in a shared budget

**As** Patricia, **I want to** see who paid for each transaction in our shared budget **so
that I can** settle what each of us actually contributed.

- Each transaction in the shared budget shows whose account it came from.
- Totals can be read per person as well as for the budget.

#### 03-S09 — End sharing

**As** Patricia, **I want to** end sharing whenever I decide to **so that I can** stay in
control of what my partner can see.

- Either person can end sharing, and it takes effect within 5 seconds.
- She is told what the other person will stop seeing before she confirms.
- Afterwards, neither person can read what the other contributed.

#### 04-S05 — Household split by person

**As** Patricia, **I want to** see our household spending split by who spent it **so that
I can** settle what each of us contributed without reconstructing it from two sets of
statements.

- Covers only transactions attributed to the shared budget.
- Each person's share is shown as an amount and as a percentage.

#### 01-S07 — Which institutions can be connected

**As** Ezequiel, **I want to** see which of my institutions can be connected and which
cannot **so that I can** find out where I stand before attempting anything.

- Each institution is listed as connectable, alerts by email, import only, or manual only,
  with what each option provides.

#### 01-S15 — Connect a bank that offers an API

The bank part of 01-S08; the design met 01-S08 with the Gmail connection.

**As** Ezequiel, **I want to** authorise a connection to a bank that offers one **so that
I can** have its transactions arrive without alerts or statements.

- Authorisation happens at the bank; the product never sees a password and holds only a
  revocable token, server-side.
- The connection can be revoked from the access screen (06-S02).
- A failed or declined authorisation leaves the account usable by import and manual entry.

#### TECH-06 — TLS 1.3 and a custom domain

**As** the team, **we want** the app served on its own domain with TLS 1.3 **so that** the
transport requirement of 1-pagers 01 and 06 is met.

- The app and the API refuse connections below TLS 1.3 (or TLS 1.2, if that is the highest
  minimum the services allow).

The default `*.cloudfront.net` certificate does not let the minimum TLS version be set, and
a custom domain needs an ACM certificate in `us-east-1`, which the current account blocks.
This item waits for an account that allows it.

## 6. First sprint

Sprint planning follows the textbook. It starts with a review of the product backlog, takes
its inputs from the items that are ready for implementation, and does three things: agree
on a sprint goal, decide which backlog items to implement, and create the sprint backlog.

### Sprint goal

> **Show where my money is, and let every figure on the dashboard be checked and
> corrected.**

This is a **functional** goal, in the textbook's three types (functional, performance and
reliability, support), with one **support** item (`TECH-01`) that protects every later
sprint. The textbook asks that it be possible to decide objectively whether a goal was met.
It is met when, on the deployed app:

1. each registered account shows a balance and where the balance came from;
2. the dashboard and the portfolio show a net worth figure, with its two parts;
3. every figure on the dashboard and the budgets page opens to a list of transactions whose
   total equals it;
4. a transaction and an investment transaction can each be removed, and every figure they
   counted in changes; and
5. a pull request that breaks a diagram or a test cannot be merged.

### Length and capacity

- **Length:** two weeks, fixed. The sprint is not extended to finish an item: anything
  unfinished at the end returns to the product backlog.
- **Forecast:** about **20 points**. The team has no velocity for this product yet. The
  textbook says that with an unknown velocity the choice of how much to take on must be
  more intuitive, and that velocity can be estimated by developing one or two stories to
  see how long they take. The two smallest items (01-S10 and 07-S07, 2 points each) are
  done first for that reason. The points actually finished at the end become the
  velocity used to plan the second sprint.
- **Mid-sprint check.** Halfway through, about half the points (10) and half the tasks
  should be done. If they are not, the team reduces scope by returning the lowest-ranked
  selected item to the product backlog, rather than extending the sprint.

### Selected items

The textbook asks for a coherent set of high-priority items that fit the goal. These are
the six highest-ranked items, and all six serve the goal.

| Rank | ID | Title | Points | Why it is in the first sprint |
|---|---|---|---|---|
| 1 | 01-S10 | Delete a transaction entered by mistake | 2 | A wrong figure that cannot be removed undermines every total. Small, and uses the save path that already exists |
| 2 | 07-S07 | Remove an investment transaction | 2 | The same gap in the portfolio, and an unmet criterion of 07-S01 |
| 3 | 01-S06 | See every account and its balance | 5 | Ezequiel's first question, and the item four later stories depend on (07-S06, 03-S03, 03-S04, 05-S04) |
| 4 | 07-S06 | See accounts and holdings in one total | 3 | Completes "what am I worth" from the vision, with only 01-S06 between it and the figures that already exist |
| 5 | 04-S04 | See the transactions behind any figure | 5 | Every 1-pager asks that each figure can be traced to its inputs; this meets that for the dashboard and budgets in one item |
| 6 | TECH-01 | Checks on every pull request | 3 | The textbook recommends continuous integration and test automation in every development sprint, and every later item changes the diagrams. Catching a broken diagram or test on the pull request is cheaper than in a generated build |
| | | **Total** | **20** | |

### Sprint backlog

Each item is broken into tasks of 4 to 16 hours, the size the textbook gives, so progress
can be seen at each daily check-in. Team members sign up for the tasks they will do rather
than having them assigned, and nobody signs up for more than they can finish in the two
weeks. If the tasks signed up for do not cover every item, the lowest-ranked item returns to
the product backlog before the sprint starts.

| Item | Task | Hours |
|---|---|---|
| 01-S10 | Add `DELETE /api/transactions/{id}` and `TransactionService.delete` to the class diagram, and the delete confirmation to section 2d | 4 |
| | Draw the sequence diagram | 4 |
| | Build the route, the service method, and the button in the edit dialog | 8 |
| | Test that every rollup returns to its earlier value and that re-importing the row or email creates nothing | 6 |
| | Check each acceptance criterion on the deployment | 4 |
| 07-S07 | Add `DELETE /api/investments/transactions/{id}` and `InvestmentService.remove` to the class diagram | 4 |
| | Draw the sequence diagram, including the refused removal | 4 |
| | Build the route and the service method, reusing the correction path | 8 |
| | Test removing an older buy before a sale, and the refused case | 6 |
| | Check on the deployment | 4 |
| 01-S06 | Design the account balance rollup in the save path and add it to the class diagram | 8 |
| | Add the BAC balance column to [`bank-formats.md`](diagrams/bank-formats.md), with the expected last balance of the sample | 4 |
| | Specify the starting balance in the account dialog and the Accounts section of the dashboard in section 2d | 6 |
| | Draw the sequence diagram | 6 |
| | Build the rollup and the template change | 16 |
| | Build the dialog field and the Accounts section | 12 |
| | Golden test on the BAC sample's last balance; unit tests for every transaction kind | 8 |
| | Check on the deployment | 4 |
| 07-S06 | Specify the net worth headline on the dashboard and the portfolio in section 2d | 4 |
| | Draw the sequence diagram | 4 |
| | Build the headline and its two parts | 12 |
| | Test the stale balance and stale price cases | 6 |
| | Check on the deployment | 4 |
| 04-S04 | Add the filter parameters of `GET /api/transactions` to the class diagram | 4 |
| | Specify the filter bar and the links on every dashboard and budget component in section 2d | 8 |
| | Draw the sequence diagram | 6 |
| | Build the query filters | 12 |
| | Build the filter bar and the links | 12 |
| | Test that each list's total equals the figure it was opened from | 8 |
| | Check on the deployment, including the 500 ms target | 4 |
| TECH-01 | Write the workflow: type checks, unit and golden tests, `cdk synth` | 8 |
| | Add the Mermaid render step | 4 |
| | Make the checks required on `main`, and confirm a pull request with a broken diagram is blocked | 4 |
| | **Total** | **216** |

### How the team runs the sprint

Scrum's ideal team has five to eight people; this team has two, so it adapts Scrum as the
textbook says small teams must:

- **Roles.** There is no separate Product Owner or ScrumMaster. Both members prioritize the
  backlog together, and one of them also keeps track of progress and reports it.
- **Daily scrum.** The two members take different classes at different times, so the daily
  meeting is a short written update in a shared chat: what was done, what is next, and what
  is blocking. The textbook suggests messaging for teams that cannot meet daily, since every
  message is kept.
- **Sprint review.** At the end, the team checks the five conditions of the sprint goal on
  the deployed app, adds the problems it found to the product backlog, and reviews its own
  way of working. The points of the items that met the Definition of Done become the
  velocity for planning the second sprint.

### Considered and left out

- **05-S03, pairing transfers (8 points).** It is the most valuable item after the selected
  ones, since transfers counted as spending are the vision's first complaint. At 8 points it
  would be more than a third of a forecast that has never been measured, and the IBAN rule
  already keeps the common case out of spending. It is the first candidate for the second
  sprint.
- **03-S13, the in-app budget warning (3 points).** Daniela's main need, but it does not
  serve this sprint's goal.
- **03-S15, deleting a budget (2 points).** Small and ranked just below the line. It is
  the first item to pull in if the team finishes early, since it continues the goal's
  "corrected" part.
- **Anything ready for refinement or for consideration**, since none meets the Definition of
  Ready.
