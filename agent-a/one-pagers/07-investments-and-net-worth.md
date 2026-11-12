# Investments and Net Worth — 1-Pager

### PROBLEM

Ezequiel puts a fixed amount into an index fund most months and holds a small amount of
bitcoin, and he tracks both in a spreadsheet because the number he cares about is not one
his broker shows him. His broker charges 1.55% to move money in, a flat fifteen cents to
buy the index fund, and a percentage rather than a flat fee on bitcoin, and getting money
back out to his bank costs a fixed international transfer charge on top. So the figure
displayed in his broker's application — units multiplied by today's price — is not what he
would receive if he sold, and it never was. His spreadsheet computes the real number by
grossing up each deposit to recover the fee, subtracting the trade cost, and holding the
withdrawal charge separately, which is the arithmetic nobody offers him and the reason he
is still maintaining formulas by hand.

The part that actually costs him time is not the arithmetic, though; it is that the prices
go stale. His sheet fetches live quotes through a spreadsheet function that has been
degrading into cached fallback values, so the totals he looks at are anchored to whatever
the last successful fetch returned, and he cannot tell by looking whether a figure is from
today or from three weeks ago. What he wants is modest and specific. He is entirely
willing to type in what he holds — he knows his own positions and they change once a
month — and he does not want the product connecting to his broker. He wants the units he
enters priced at today's market, the fees he has already described applied honestly, and
a single figure for what he would have if he sold everything and brought it home, sitting
next to what is in his bank accounts so that one number describes what he is actually
worth.

### ASSUMPTIONS

- **Assumed.** Holdings are entered and maintained by hand. No story here connects to a
  broker or exchange, and none is planned; the position count is small and changes
  monthly, so manual entry costs little and removes an entire class of integration.
- **Assumed.** Market prices for publicly traded funds and major cryptocurrencies are
  available from commercial price feeds under free tiers with request limits in the range
  of a few hundred calls per day, which is sufficient because prices are shared across all
  users of the product rather than fetched per user.
- **Unverified.** The specific feed, its per-day limit, and whether its terms permit use
  in a product rather than for personal use only. Settled by selecting candidate feeds and
  recording each one's published limit and licence terms here before any story depends on
  one.
- **Assumed.** Fee structures differ per asset class within a single broker — a flat fee
  on one instrument and a percentage on another is the normal case, not an exception — so
  a fee profile must express both forms.
- **Assumed.** A deposit fee is charged as a percentage of the gross amount, so recovering
  the fee from a known net amount requires grossing up rather than multiplying the net.
- **Assumed.** Cost basis includes every fee paid to acquire a position. Gains are
  measured against total spent, not against the nominal amount invested.
- **Assumed.** Exit costs are knowable in advance from the fee profile, so a net
  liquidation figure can be computed without executing anything.
- **Assumed.** All holdings here belong to one person. Positions held jointly with others,
  and any splitting of units or fees between people, are explicitly out of scope.

### FUNCTIONAL REQUIREMENTS

* **07-S01** — **As** Ezequiel, **I want to** record what I hold by entering it myself
  **so that I can** track my positions without connecting the product to my broker
  * A holding records instrument, units, and the account or broker it sits with
  * Fractional units are supported to the precision his broker reports
  * Holdings can be corrected and removed, and nothing requires an external connection

* **07-S02** — **As** Ezequiel, **I want to** see my holdings valued at current market
  prices **so that I can** stop looking at figures anchored to a stale quote
  * Each holding shows its current value with the time the price was retrieved
  * A price that could not be refreshed is shown as stale with its age, never presented as
    current
  * Prices refresh without him asking

* **07-S03** — **As** Ezequiel, **I want to** describe the fees my broker charges **so that
  I can** have every figure account for them instead of correcting each one by hand
  * A fee profile holds a deposit fee as a percentage, a trade fee as either a flat amount
    or a percentage, and a withdrawal fee as a flat amount
  * Trade fees can differ per asset class within one profile
  * A profile applies to the holdings placed under it and can be edited afterwards

* **07-S04** — **As** Ezequiel, **I want to** record a contribution with the fees it
  actually incurred **so that I can** know what a position has really cost me
  * A contribution records date, amount, units acquired, and price
  * Fees are derived from the fee profile, including grossing up the deposit fee from the
    net amount
  * Derived fees can be overridden for a contribution that was charged differently

* **07-S05** — **As** Ezequiel, **I want to** see what I would actually receive if I sold
  everything today **so that I can** know what my investments are worth to me rather than
  on paper
  * The figure is current market value less the exit fees the profile defines, less the
    withdrawal cost of bringing the money back
  * Each deduction is itemised
  * The figure states the price time it was computed from

* **07-S06** — **As** Ezequiel, **I want to** see my accounts and my holdings in one total
  **so that I can** answer what I am worth without adding two numbers from two places
  * Account balances and net liquidation value combine into one figure
  * The figure states its display currency, conversion rate, and rate date
  * The two components remain separately visible

### NON-FUNCTIONAL REQUIREMENTS

- **Price freshness.** Prices are no more than 15 minutes old during market hours. Any
  price older than that is displayed with its age rather than presented as current.
- **Price source resilience.** Loss of the price feed degrades the product to last-known
  prices, clearly labelled with their age. It never blocks entry, editing, or any other
  part of the product.
- **Feed efficiency.** Prices are retrieved once per instrument per interval and shared
  across all users, so request volume scales with the number of distinct instruments held
  rather than the number of users.
- **Arithmetic precision.** Unit quantities support at least 8 decimal places, and
  monetary values are held as exact decimals. Percentage fees are applied without
  intermediate rounding, and results round only at presentation.
- **Derivation transparency.** Every computed figure — cost basis, gain, net liquidation —
  can be expanded to show its inputs and the fee rules applied.
- **No advice.** The product states values and costs and never recommends buying, selling,
  holding, or rebalancing, and displays no projection of future value.
- **Valuation performance.** Revaluing 100 holdings and recomputing net worth completes
  within 1 second of prices arriving.

### REQUIREMENTS SIZING

Story points on the modified Fibonacci scale, against the baseline anchor **01-S03 = 2
points** (see `../sizing.md`).

| Story | Size | Rationale |
|---|---|---|
| 07-S01 | 3 | Modestly above the anchor. Structurally the same as 01-S03 — a form and a stored record — with high-precision fractional units as the only real increment. No external dependency, no unknowns. |
| 07-S02 | 5 | Two and a half times the anchor. Integrating a price feed, scheduling refresh, caching per instrument, and surfacing staleness honestly. Technology is new and unknowns sit in the feed's limits and terms rather than in the code. |
| 07-S03 | 5 | Comparable to 07-S02 for different reasons. Little technology risk, but the model must express flat and percentage fees, vary by asset class, and be edited without corrupting figures already derived from it. Complexity is in the model, not the interface. |
| 07-S04 | 5 | Two and a half times the anchor. The gross-up is a formula, but the story carries a contribution record, fee derivation from 07-S03, and a per-contribution override path, and it is where cost basis becomes correct or permanently wrong. |
| 07-S05 | 3 | Above the anchor, and cheap only because 07-S02 and 07-S03 already supply the price and the fee rules. What remains is composing them and itemising the deductions. Its value is high and its incremental cost is not. |
| 07-S06 | 3 | Modestly above the anchor. Adds two established figures and depends on 05-S02 for the conversion and its provenance. Breadth, not difficulty; unknowns none. |
