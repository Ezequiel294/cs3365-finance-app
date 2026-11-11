# Multi-Currency and Account Roles — 1-Pager

### PROBLEM

Ezequiel is paid in dollars and buys everything in colones, and every tool he has tried
handles that by pretending one of those facts is not true. Some refuse a second currency
outright. Others convert everything to a single display currency using a rate they do not
name, on a date they do not state, so that the total he sees is a number he cannot check
and did not authorise. Neither behaviour is acceptable to him for the same reason: a
₡14,000 purchase was ₡14,000, and turning it into $27.40 without saying which rate was
used on which day destroys the only figure he can verify against his statement.

Worse is what those tools do with his own money moving around. His card is attached to a
small account he tops up by hand, precisely so that losing it cannot cost him much, which
means several times a month he moves money from his dollar salary account into his colones
spending account. Every tracker he has used records that as spending. It is not spending —
he has exactly as much money after it as before, minus whatever the bank charged to do it
— and counting it means his monthly totals are inflated by a number that has nothing to do
with anything he bought. The same misreading applies to the money he moves into his
untouchable envelopes at the other bank. What his accounts encode, and no tool reflects,
is that they have different jobs: one holds salary, one holds savings he has decided not
to touch, one is the small float he spends from.

### ASSUMPTIONS

- **Verified (2026-09-20).** An official published exchange rate is available
  programmatically. The Banco Central de Costa Rica exposes *Indicadores Económicos*
  covering USD and EUR rates, interest rates, and inflation, requiring authentication over
  HTTPS; the Ministerio de Hacienda exposes a *Tipo de Cambio* endpoint returning current
  dollar and euro rates with no parameters. Both are catalogued in the public `public-apis-cr`
  directory of Costa Rican open APIs.
- **Assumed.** An official published rate is the right default basis for conversion,
  because it is verifiable by a third party, rather than a commercial rate the product
  would have to justify.
- **Assumed.** The rate applicable to a transaction is the rate on its transaction date,
  not the rate at the time the display is rendered, so historical totals do not change
  retroactively.
- **Assumed.** A transfer between a person's own accounts appears as two separate
  transactions, in opposite directions, at possibly different times and — when currencies
  differ — different amounts, so pairing cannot rely on amounts matching.
- **Assumed.** The cost of moving money between one's own accounts, including any spread
  between the rate charged and the published rate, is a real cost and is recorded as such,
  distinct from both spending and transfer.
- **Assumed.** An account's role is set by the person, not inferred. The product may
  suggest a role but never assigns one silently.
- **Unverified.** That published rates remain available without a commercial agreement as
  usage grows. Settled by reading the terms attached to each endpoint and recording what
  they permit.

### FUNCTIONAL REQUIREMENTS

* **05-S01** — **As** Ezequiel, **I want to** see every amount in the currency it actually
  occurred in **so that I can** check any figure against my bank statement
  * The original currency and amount are shown on every transaction and never replaced
  * Lists containing more than one currency show each in its own, without converting
  * A converted figure is always presented alongside the original, never instead of it

* **05-S02** — **As** Ezequiel, **I want to** choose a currency for my totals and see which
  rate produced them **so that I can** trust a combined figure enough to use it
  * The display currency is his choice and can be changed at any time
  * Any converted total states the rate used and the date it is from
  * The source of the rate is named

* **05-S03** — **As** Ezequiel, **I want to** mark two movements as a transfer between my
  own accounts **so that I can** stop my own money moving around being counted as
  spending
  * Candidate pairs are proposed across his accounts, including across currencies where
    amounts differ
  * A confirmed transfer is excluded from spending totals on both sides
  * Any cost incurred by the transfer is recorded separately and is visible as a cost

* **05-S04** — **As** Ezequiel, **I want to** give each of my accounts a role **so that I
  can** have the product understand that a small spending balance is deliberate rather
  than a problem
  * Each account carries a role he sets, such as savings he does not draw on, income, or
    day-to-day spending
  * Warnings and budgets respect the role, so a deliberately small spending balance
    raises nothing
  * A role can be changed at any time and is never assigned without him choosing it

* **05-S05** — **As** Ezequiel, **I want to** see what a currency conversion actually cost
  me **so that I can** know the price of moving my salary into what I spend from
  * The cost is the difference between the rate applied and the published rate on that date
  * It is shown against the transfer that incurred it
  * Conversion costs accumulate into a figure he can read for a period

* **05-S06** — **As** Patricia, **I want to** import a statement in a currency and have it
  stay in that currency **so that I can** reconcile what I imported against the document I
  downloaded
  * The currency of an imported file is detected or asked for once per mapping
  * Imported amounts are never converted on import
  * An import mixing currencies in one file is handled per row rather than refused

### NON-FUNCTIONAL REQUIREMENTS

- **No implicit conversion.** No stored amount is ever converted in place. Conversion is a
  presentation concern only; the original amount and currency are immutable for the life
  of the transaction.
- **Rate provenance.** Every converted figure exposes the rate value, the rate date, and
  the name of its source, reachable in one interaction from the figure itself.
- **Rate freshness.** The published rate is retrieved at least once per business day. A
  rate more than 24 hours old is displayed with its age; at more than 7 days old the
  product stops converting altogether and shows original currencies only, rather than
  presenting a figure derived from a stale rate.
- **Rate availability.** Loss of the rate source degrades the product to
  original-currency display within one refresh cycle. It never blocks capture,
  categorization, budgeting, or any other capability.
- **Historical stability.** A total for a past period recomputes to the same value on any
  later date, to the minor unit, because each transaction converts at the rate of its own
  transaction date.
- **Arithmetic precision.** Monetary amounts are held as exact decimals, never as binary
  floating point. Exchange rates are held to at least 6 decimal places. Conversion results
  round half-to-even to the target currency's minor unit — 2 decimal places for US
  dollars, 0 for colones — and that rule applies everywhere without exception.
- **Conversion performance.** Converting and totalling 5,000 transactions across two
  currencies for display completes within 1 second.
- **Transfer detection safety.** Zero transaction pairs are excluded from spending without
  explicit confirmation. A false exclusion understates spending silently, so the product
  never acts on a probable match on its own.

### REQUIREMENTS SIZING

Story points on the modified Fibonacci scale, against the baseline anchor **01-S03 = 2
points** (see `../sizing.md`).

| Story | Size | Rationale |
|---|---|---|
| 05-S01 | 5 | Two and a half times the anchor, and pervasive rather than hard. Amount and currency travel together through every list, total, and view, and the prohibition on replacing the original constrains all of them. No new technology; the cost is breadth and the discipline of never collapsing the pair. |
| 05-S02 | 5 | Comparable to 05-S01. Integrating a rate source, caching per date, and surfacing provenance on every converted figure. Technology is new but the endpoints are documented and verified to exist; unknowns are mainly in their terms of use. |
| 05-S03 | 8 | Four times the anchor. Complexity dominates: pairing across accounts, across currencies where amounts legitimately differ, and across a time gap, with a false positive silently understating spending. Related to 01-S04 but materially harder, since matching amounts cannot be relied on. |
| 05-S04 | 3 | Modestly above the anchor. Roles are a small attribute; the work is that budgets and warnings must consult them, which is a handful of touchpoints rather than new machinery. Low unknowns. |
| 05-S05 | 5 | Two and a half times the anchor. Depends on both 05-S02 for the published rate and 05-S03 for identifying the transfer, then compares applied against published. The arithmetic is simple; establishing which rate was actually applied from the data available is not. |
| 05-S06 | 3 | Above the anchor. Extends the import mapping from 01-S02 with currency detection and per-row handling. Contained, reuses existing machinery, and carries no new technology. |
