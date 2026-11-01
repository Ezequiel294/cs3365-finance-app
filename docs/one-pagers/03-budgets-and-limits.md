# Budgets and Limits — 1-Pager

### PROBLEM

Daniela finds out she has overspent by running out of money. She is paid once a month
into one account, spends from her phone twenty or so times a week in small amounts, and
has no running sense of what is left because nothing tells her until the balance does.
The week before payday is unpleasant in a way that is entirely predictable in hindsight
and entirely invisible at the time, and by the time her bank's balance makes the point,
the decisions that caused it were made two weeks earlier. What she is missing is not a
report; it is being told on the Tuesday that the month is running short, while there are
still decisions left to make.

Andrés has the opposite shape of the same problem. He is paid in irregular lumps when
client invoices clear, sometimes twice in a month and sometimes not at all, so the advice
everyone gives him — divide your monthly income into categories — has no monthly income to
divide. A good month reads as though he can afford anything and a lean one reads as an
emergency, even when the two average out comfortably, so he oscillates between
overspending and refusing to spend at all. He does not want a prediction of what his
clients will pay; he knows that is unknowable. He wants the money already sitting in his
account described honestly: what of it is already committed, what is genuinely free, and
how long it lasts if nothing else arrives. Keisy has neither problem and a third one
instead: she budgets well and cannot see how she is doing. She watches groceries by the
week, rent by the month, and clothing by the year, all at once, and every tool she has
tried assumes the month is the only unit that exists. When she does get a total she has
to work out the proportion herself — that ₡68,000 against ₡45,000 set aside is 151%, the
number that actually tells her something — and no tool will tell her what a year of
holding to these budgets is worth, which is the only reason she keeps them. Patricia's
version is different again: she and her partner each spend from their own accounts
against shared household costs, and the recurring argument is not about the total but
about who spent what, which neither of them can answer at the end of the month.

### ASSUMPTIONS

- **Assumed.** A budget's period is a week, a calendar month, or a calendar year, chosen
  per budget. A person may run budgets of different periods at the same time over the
  same money, and no period is privileged over the others.
- **Assumed.** Budgets at different periods are independent of one another. A weekly
  grocery budget does not roll up into, or draw down from, a monthly or annual one.
- **Unverified.** Whether nested budgets — a weekly allowance drawing from a monthly
  envelope drawing from an annual one — are wanted. Nesting requires allocation and
  rollover rules and is materially larger than independent periods, so it is excluded
  until asked for. Settled by asking Keisy directly.
- **Assumed.** A week runs Monday to Sunday. Weeks do not divide evenly into months or
  years, so a weekly budget's periods are counted from its start date rather than aligned
  to month boundaries.
- **Assumed.** The year-end saving figure projects *adherence*, not income: it assumes she
  spends exactly to budget for the periods remaining, and adds the surplus or deficit
  already accumulated. It is a statement of what the budgets are worth if kept, not a
  forecast of what will happen.
- **Assumed.** Committed costs — rent, subscriptions, recurring transfers — can be
  identified from repeating transactions, and the user can confirm or correct the list
  rather than entering it from scratch.
- **Assumed.** Safe-to-spend is computed only from money that has actually arrived. No
  story here projects future income, and expected invoices are excluded from the figure
  even when the user knows about them.
- **Assumed.** Two people sharing a household budget each hold their own accounts, and
  sharing means sharing the budget and the transactions attributed to it, not access to
  each other's accounts.
- **Unverified.** That an alert delivered before an overspend actually changes behaviour
  rather than being dismissed like every other notification. Settled by observing whether
  users who receive them end periods within their limits more often than those who do not.
- **Assumed.** Limits are advisory. Nothing in the product blocks or declines a
  transaction, and no story here implies it could.

### FUNCTIONAL REQUIREMENTS

* **03-S01** — **As** Daniela, **I want to** be warned that I am running down the money I
  had for the month **so that I can** change what I do while it still makes a difference
  * The warning arrives on crossing a proportion of the limit she sets, not on exceeding it
  * It states how much is left and how many days remain in the period
  * Warnings can be silenced per budget without switching off the budget itself

* **03-S02** — **As** Ezequiel, **I want to** set a separate limit for each spending group
  **so that I can** keep my university costs and my hobbies from being measured against
  one another
  * Each group carries its own limit and period
  * A group with no limit still accumulates a total and is simply not compared against one
  * Progress against every limit is visible in one view

* **03-S03** — **As** Andrés, **I want to** see how much I can safely spend this period
  **so that I can** stop guessing in the weeks between client payments
  * The figure is derived from money that has arrived, less committed costs, and never
    from anticipated income
  * The product shows what it subtracted to reach the figure
  * The figure updates when a payment arrives or a commitment changes

* **03-S04** — **As** Andrés, **I want to** see how long my current money lasts at my
  current rate of spending **so that I can** judge how lean a month I am actually in
  * The projection is stated as a date or a number of weeks, with the spending rate it
    assumes
  * The rate used is visible and can be based on a period he chooses
  * The projection is presented as a consequence of current behaviour, not a prediction of
    his income

* **03-S05** — **As** Patricia, **I want to** share a household budget with my partner
  **so that I can** see one agreed set of figures instead of each of us keeping our own
  * Both people see the same budget, limits, and attributed transactions
  * Each transaction attributed to the household budget shows who spent it
  * Sharing a budget gives neither person access to the other's accounts or to
    transactions outside the shared budget

  > **Split.** Sized at 13 and therefore too large to estimate reliably. Replaced for
  > implementation by **03-S07**, **03-S08**, and **03-S09** below. Retained here because it states the need those
  > stories exist to serve.

* **03-S06** — **As** Ezequiel, **I want to** confirm which of my recurring costs are
  commitments **so that I can** have them excluded from what I think is free to spend
  * Repeating transactions are proposed as candidate commitments for him to confirm
  * A confirmed commitment is subtracted from safe-to-spend for its period
  * A commitment can be added by hand for something that has not recurred yet

* **03-S07** — **As** Patricia, **I want to** invite my partner to a budget **so that I
  can** have us both working from the same agreed figures
  * An invitation goes to a person she names and takes effect once they accept
  * Accepting grants sight of the budget, its limits, and the transactions attributed to it
  * Neither person gains sight of the other's accounts or of anything outside that budget

* **03-S08** — **As** Patricia, **I want to** see who paid for each transaction in our
  shared budget **so that I can** settle what each of us actually contributed
  * Every attributed transaction shows which participant it came from
  * Totals can be read per participant as well as for the budget as a whole
  * Attribution follows the originating account rather than being entered by hand

* **03-S09** — **As** Patricia, **I want to** end sharing whenever I decide to **so that I
  can** stay in control of what my partner can see
  * Either participant can end sharing, and it takes effect immediately
  * She is told what the other person will stop seeing before she confirms
  * After ending, neither participant can read data the other contributed

* **03-S10** — **As** Keisy, **I want to** set a budget over a week, a month, or a year
  **so that I can** watch the things that vary weekly apart from the ones only a year
  makes sense of
  * A budget's period is chosen when it is created and can be changed afterwards
  * Budgets of different periods run at the same time over the same transactions
  * A weekly budget counts its periods from its own start date rather than from month
    boundaries

* **03-S11** — **As** Keisy, **I want to** see what proportion of each budget I have used,
  including when I have gone past it **so that I can** tell at a glance how far over or
  under I am rather than comparing two figures myself
  * The proportion is stated as a percentage wherever a budget appears
  * A budget exceeded reads above 100% — 151%, not a full bar — and the amount over is
    shown alongside it
  * The underlying spent and budgeted amounts remain visible next to the proportion

* **03-S12** — **As** Keisy, **I want to** see what I would have saved by the end of the
  year if I stay inside my budgets **so that I can** tell what keeping to them is
  actually worth
  * The figure assumes spending exactly to budget for the periods remaining, and includes
    the surplus or deficit already accumulated
  * It states plainly that it assumes adherence rather than predicting her spending
  * She can see the periods and budgets it was built from

### NON-FUNCTIONAL REQUIREMENTS

- **Warning timeliness.** A threshold warning is delivered within 15 minutes of the
  transaction that crosses it, since a warning after the fact is a report.
- **Warning restraint.** At most one threshold warning per budget per period, unless the
  user opts into more. An alert people learn to dismiss has negative value.
- **Recalculation performance.** Safe-to-spend and limit progress recompute within 1
  second of a transaction changing, across 5,000 transactions in the period.
- **Proportion presentation.** A budget's consumption is shown as a percentage rounded to
  a whole number, with no upper bound on the value displayed. Exceeding a budget is never
  represented only by a filled bar or a colour change.
- **Multi-period performance.** Progress for 20 budgets across mixed weekly, monthly, and
  annual periods recomputes within 1 second of a transaction changing.
- **Sharing isolation.** A person invited to a shared budget can read only the budget,
  its limits, and transactions explicitly attributed to it. Account balances and
  unattributed transactions are never exposed by sharing.
- **Sharing revocability.** Either participant can end sharing at any time, taking effect
  immediately; afterwards neither can read data created by the other.
- **Transparency of derivation.** Every derived figure — safe-to-spend, runway, progress —
  can be expanded to show the inputs it was computed from. No number appears without a
  way to see where it came from.
- **Advisory only.** No limit, warning, or projection blocks, delays, or modifies any
  transaction.

### REQUIREMENTS SIZING

Story points on the modified Fibonacci scale, against the baseline anchor **01-S03 = 2
points** (see `../sizing.md`).

| Story | Size | Rationale |
|---|---|---|
| 03-S01 | 5 | Two and a half times the anchor. The threshold arithmetic is trivial; the cost is delivery — evaluating on every incoming transaction, holding per-period state so a warning fires once, and per-budget silencing. Technology is familiar, unknowns low. |
| 03-S02 | 3 | Modestly above the anchor. Limits attach to groups that 02-S02 already established, so this is configuration plus a progress view. Breadth rather than difficulty, and no new technology. |
| 03-S03 | 8 | Four times the anchor. Complexity is the driver: the figure depends on commitments from 03-S06, on the period boundary, and on a deliberate exclusion of anticipated income that must survive contact with users who expect it counted. The requirement to show the derivation is as much work as the derivation. |
| 03-S04 | 5 | Half again above 03-S02 and comparable to 03-S01. The arithmetic is simple division; the work is choosing a defensible spending rate, letting the user change its basis, and presenting a projection without implying a forecast. Moderate unknowns in what rate proves sensible. |
| 03-S05 | — (split) | Sized at 13: size and complexity both large and the unknowns structural. It introduced a second identity, an invitation flow, an authorization boundary that must hold under revocation, and a partial-visibility rule every existing query has to respect. Exceeded the splitting threshold, so it carries no estimate and is replaced by 03-S07, 03-S08, and 03-S09. |
| 03-S07 | 5 | Two and a half times the anchor. Invitation and acceptance are conventional, but this is where the authorization boundary is established and every later query depends on it being right. Complexity sits in the boundary, not the flow. |
| 03-S08 | 3 | Modestly above the anchor. Attribution follows from the originating account once 03-S07 exists, so this is a derived field plus a per-participant total over data already present. |
| 03-S09 | 5 | Two and a half times the anchor. Revocation must reach every path opened by 03-S07 and hold under partial failure, and disclosing what the other person loses is part of the work. Comparable to 03-S07 for the same reason. |
| 03-S06 | 5 | Two and a half times the anchor. Detecting repetition across varying amounts and dates is real work, and the confirmation step plus manual addition adds surface. No new technology; unknowns concentrated in what counts as a recurrence. |
| 03-S10 | 5 | Two and a half times the anchor. The period model is small to state and pervasive to honour: every limit, warning, progress figure, and total has to resolve against a period that may be a week, a month, or a year, and weekly periods do not align to month boundaries. Complexity in the boundary arithmetic rather than the interface. |
| 03-S11 | 3 | Modestly above the anchor. The arithmetic is one division. The work is presenting it wherever a budget appears and making beyond-100% read correctly in components built on the assumption that progress stops at full. |
| 03-S12 | 5 | Two and a half times the anchor. Depends on 03-S10 for the periods and 03-S06 for commitments, then projects across the periods remaining in the year. The arithmetic is simple; stating a figure that assumes adherence without it being read as a prediction is the part that needs care. |
