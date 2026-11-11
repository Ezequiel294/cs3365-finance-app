# Dashboard and Insights — 1-Pager

### PROBLEM

Daniela can list what she spent yesterday and has no idea what she spent last month. The
information exists — it is in her banking app, one screen at a time, in the order it
happened, with no sense of which of those forty lines mattered — but reading a
chronological list has never once told her that she is spending a third of her money on
eating out. She does not want to study her finances; she wants to glance at something and
come away with one fact she did not have before. Ezequiel's version is sharper: he
already knows his totals because he computed them, and what his spreadsheet cannot easily
show him is whether this month is unusual. A number by itself is not information. A
number next to the three months before it is.

The way this normally fails is that a product answers with decoration: a colourful chart
that is pleasant to look at and answers no question anyone was actually asking, and which
cannot be interrogated when it shows something surprising. When Ezequiel sees a category
that looks too high, the only useful next move is to see the transactions that produced
it, immediately, without navigating somewhere else and reconstructing the filter by hand.
Patricia needs one thing neither of them does: the household total broken down by which
of the two of them spent it, because that is the actual subject of the recurring argument
and no chart of categories will settle it.

### ASSUMPTIONS

- **Assumed.** A view is worth building only if it answers a question someone stated. Each
  story below names the question its view answers, and a view whose question cannot be
  stated is not built.
- **Assumed.** Comparison across periods is only meaningful once roughly three periods of
  data exist; before that the product shows totals rather than trends, and says why.
- **Assumed.** Mixed-currency totals must be handled explicitly rather than summed. How
  that is done is specified in `05-multi-currency-and-fx.md`; this initiative depends on
  it rather than restating it.
- **Assumed.** The primary device for reading a dashboard is a phone, and every view here
  is designed to be legible at phone width before it is designed for a larger screen.
- **Assumed.** Uncategorized transactions distort any breakdown, so they are shown as
  their own visible share rather than omitted or silently folded into another category.
- **Unverified.** That a single summary view can serve both Daniela, who wants one fact,
  and Ezequiel, who wants to compare and drill in. Settled by putting the same view in
  front of both kinds of user; if it cannot, the view splits rather than accumulating
  controls.

### FUNCTIONAL REQUIREMENTS

* **04-S01** — **As** Daniela, **I want to** see where last month's money went **so that I
  can** learn something about my spending without having recorded any of it
  * Answers the question: *which categories took the largest share of what I spent?*
  * Categories are ordered by share, with the uncategorized share shown alongside them
  * The view is readable without interaction — no control has to be operated to get the
    answer

* **04-S02** — **As** Ezequiel, **I want to** compare a period against the ones before it
  **so that I can** tell whether this month is unusual or normal for me
  * Answers the question: *is this period higher or lower than my recent periods, and by
    how much?*
  * Shows at least three prior periods where the data exists, and says so when it does not
  * The comparison is stated as a difference, not left for the reader to compute

* **04-S03** — **As** Ezequiel, **I want to** see spending broken down by group as well as
  by category **so that I can** find out what my university living actually costs me
  * Answers the question: *how much did each of my budgets consume this period?*
  * Group and category breakdowns are reachable from the same view without renavigating
  * A group's total can be read alongside its limit where one is set

* **04-S04** — **As** Daniela, **I want to** open a part of a chart and see the
  transactions behind it **so that I can** find out what made a number look wrong
  * Answers the question: *what exactly produced this figure?*
  * Selecting any segment, bar, or row lists the transactions composing it
  * The resulting list carries the same period and filters, with no re-selection required

* **04-S05** — **As** Patricia, **I want to** see our household spending split by who
  spent it **so that I can** settle what each of us contributed without reconstructing it
  from two sets of statements
  * Answers the question: *of what we spent together, how much did each of us pay for?*
  * Covers only transactions attributed to the shared budget
  * Each person's share is shown as both an amount and a proportion

* **04-S06** — **As** Andrés, **I want to** see my income alongside my spending over time
  **so that I can** see how lumpy months actually compare against what I spent in them
  * Answers the question: *when did money arrive, and how did spending track it?*
  * Incoming and outgoing amounts are distinguishable at a glance
  * Periods with no income are visible as such rather than rendered as gaps

### NON-FUNCTIONAL REQUIREMENTS

- **Render latency.** Any view here renders within 1.5 seconds over 5,000 transactions on
  a current mid-range phone, including the aggregation behind it.
- **Drill-through latency.** The transaction list behind a selected element appears within
  500 ms.
- **Phone-width legibility.** Every view is legible and fully operable at 360 px width
  with no horizontal scrolling and no truncation of figures.
- **Accessibility.** No view conveys information by colour alone; every series is
  distinguishable by label, pattern, or position. Text meets a 4.5:1 contrast ratio.
- **Honest emptiness.** A view with insufficient data says what is missing and what would
  fill it, rather than rendering an empty or misleading chart.
- **No silent currency mixing.** A total spanning currencies never presents a single
  figure without stating the conversion basis and the rate date.
- **Derivation.** Every figure can be expanded to the transactions that produced it.

### REQUIREMENTS SIZING

Story points on the modified Fibonacci scale, against the baseline anchor **01-S03 = 2
points** (see `../sizing.md`).

| Story | Size | Rationale |
|---|---|---|
| 04-S01 | 5 | Two and a half times the anchor. Aggregation is straightforward, but this establishes the charting approach for the product — a cross-platform rendering choice that constrains every later view. Technology carries the weight; the first chart costs several times what the second does. |
| 04-S02 | 5 | Comparable to 04-S01 and for different reasons. Period boundaries, incomplete trailing periods, and stating a difference rather than showing two numbers are all fiddly. Low technology risk once 04-S01 lands, moderate complexity. |
| 04-S03 | 3 | Above the anchor but modest. Reuses the aggregation and rendering established by 04-S01 over the second dimension from 02-S02, plus a limit overlay. Breadth rather than novelty. |
| 04-S04 | 5 | Two and a half times the anchor. Not difficult individually but cross-cutting: every view must carry its filter state into a shared list, which is a constraint on all of them rather than a feature of one. Unknowns low, complexity in the plumbing. |
| 04-S05 | 3 | Modestly above the anchor, and cheap only because 03-S05 has already established shared budgets and per-person attribution. Without that it would be far larger; as written it is one breakdown over data that exists. |
| 04-S06 | 3 | Above the anchor for the same reasons as 04-S03. Two series on one timeline using established rendering; the only real care is making periods with no income read as zero rather than missing. |
