# Categorization and Rules — 1-Pager

### PROBLEM

Ezequiel's spending falls into two questions at once, and existing tools only ever ask
him one. A ₡14,000 supermarket charge is groceries — that is what it was — but it also
belongs to the money he has set aside for living away from his parents, which is a
different question with a different budget behind it, and which has nothing to do with
whether the next groceries charge belongs there too. Some of his food spending is
university living, some of it is a hobby he cooks for, and a tracker that lets him pick
one label makes him choose which of those two facts to throw away. He currently resolves
this with a column in his spreadsheet, which works precisely because a spreadsheet lets
him invent a second dimension when he needs one.

The other half of the problem is when he is asked. A month later, looking at a list of
merchant names, he genuinely cannot remember whether a particular Tuesday's charge was
the university one or the hobby one, so he guesses, and the guesses accumulate until the
totals stop meaning anything. The moment he does know is the moment the card is charged —
he is standing there, he knows exactly what he just bought and why. Daniela has a milder
version of the same problem and a lower tolerance for it: she makes twenty small payments
a week and will not file any of them by hand, so whatever she sees at the end of the week
has to have sorted itself out without her involvement. Keisy sits between them and shows
where asking goes wrong: she values the question for the purchases she genuinely has to
think about, and is worn down by being asked about the supermarket, the bus, and the
streaming charge she has answered identically every time for a year, until she stops
reading the prompt and starts tapping it away.

### ASSUMPTIONS

- **Unverified.** That a charge can be surfaced to the user close enough to the moment it
  occurs for them to still remember its purpose. Settled by the same investigation that
  bounds 01-S01, plus a measurement of how long alerts from a given institution take to
  arrive.
- **Unverified.** That the platform permits an application to react to an incoming
  transaction notification in the background. Mobile platforms differ materially here, and
  at least one restricts reading notifications delivered to other applications. Settled by
  a spike on each target platform before any story here depends on it.
- **Assumed.** Merchant descriptors on transactions are inconsistent in spelling and
  padding within one institution but stable enough that a normalised form matches reliably.
- **Assumed.** Most people's spending concentrates on a small number of repeat merchants,
  so automatic categorization reaches useful accuracy from a modest number of corrections
  rather than requiring a trained model.
- **Assumed.** Category and spending group are genuinely independent: any category may
  appear under any group, and neither constrains the other.
- **Assumed.** Being asked about a transaction has a cost that rises with how often the
  answer was predictable. A prompt that fires for settled categories trains people to
  dismiss it, which destroys its value for the transactions that genuinely need a decision.
- **Assumed.** A transaction belongs to at most one group. Splitting a single charge
  across two groups is deliberately out of scope until someone asks for it.

### FUNCTIONAL REQUIREMENTS

* **02-S01** — **As** Ezequiel, **I want to** be asked which group a charge belongs to at
  the time it is charged **so that I can** answer while I still remember what I bought
  * The prompt offers the groups he uses most, and answering takes one tap
  * Dismissing the prompt leaves the transaction unfiled rather than guessing, and it can
    be filed later
  * The prompt can be turned off entirely without affecting anything else in the product

* **02-S02** — **As** Ezequiel, **I want to** give a transaction both a category and a
  spending group **so that I can** ask what I spent on food and what my university
  budget cost me without the two answers competing
  * Category and group are recorded independently, and either may be set without the other
  * Both are visible on the transaction and either can be changed afterwards
  * Totals can be produced by category, by group, or by both together

* **02-S03** — **As** Daniela, **I want to** have my transactions sorted into categories
  without doing it myself **so that I can** see where my week went without filing
  anything
  * A newly captured transaction receives a category automatically where one can be
    determined with confidence
  * Transactions the product cannot categorize confidently are marked as uncategorized
    rather than assigned a wrong category
  * Automatic categorization never overwrites a category a person set by hand

* **02-S04** — **As** Ezequiel, **I want to** create a rule that files matching
  transactions automatically **so that I can** stop answering the same question about the
  same merchant every month
  * A rule matches on merchant, amount range, account, or a combination
  * A rule can set category, group, or both
  * Rules are listed in the order they apply and can be reordered, edited, and switched off

* **02-S05** — **As** Ezequiel, **I want to** correct a categorization and have that
  correction remembered **so that I can** fix a mistake once rather than every month
  * Correcting a transaction offers to create or update a rule covering similar ones
  * He chooses whether the correction applies only to this transaction, to future ones, or
    also to past ones
  * Applying a correction to past transactions reports how many were changed

* **02-S06** — **As** Daniela, **I want to** find the transactions that have not been
  categorized **so that I can** clear them in one sitting instead of hunting for them
  * Uncategorized transactions are reachable in one step from the main view
  * They can be categorized from that list without opening each one
  * The list shows how many remain

* **02-S07** — **As** Keisy, **I want to** have transactions whose category is already
  settled filed without being asked **so that I can** be prompted only for the ones I
  actually need to decide
  * A transaction matched by a rule from 02-S04 is filed silently and raises no prompt
  * Setting a default from a prompt is offered at the moment she answers it, so settling a
    category costs nothing extra
  * She can see which transactions were filed silently, and undo a default that turns out
    to be wrong

### NON-FUNCTIONAL REQUIREMENTS

- **Prompt latency.** Where a charge can be surfaced at all, the prompt appears within 60
  seconds of the product receiving it, since its entire value depends on arriving while
  the purchase is remembered.
- **Prompt cost.** Filing a transaction from the prompt takes exactly one interaction and
  requires no typing.
- **Prompt suppression.** A transaction matched by a rule raises no prompt. Prompt volume
  falls as defaults accumulate, and a person who has settled their recurring merchants
  sees prompts only for genuinely new ones.
- **Categorization accuracy.** After 30 user corrections in an account, at least 80% of
  newly captured transactions from previously seen merchants receive the category the user
  would have chosen. Accuracy is measured against subsequent corrections, not asserted.
- **Bulk correction performance.** Applying a rule retroactively across 5,000
  transactions completes within 5 seconds and reports the count changed.
- **Determinism.** Given the same transaction and the same rule set, categorization
  produces the same result every time, and the rule responsible is inspectable.
- **No silent overwriting.** No automatic process changes a category or group a person set
  by hand, under any circumstance.
- **Privacy of prompting.** A notification prompt discloses no amount or merchant on a
  locked screen unless the user has explicitly enabled that.

### REQUIREMENTS SIZING

Story points on the modified Fibonacci scale, against the baseline anchor **01-S03 = 2
points** (see `../sizing.md`).

| Story | Size | Rationale |
|---|---|---|
| 02-S01 | 8 | Small in interface and large in everything else. Complexity and technology both rise sharply: it depends on background delivery of a charge, differs per platform, and at least one platform may not permit it at all. Not 13 only because the fallback — prompting when the app is next opened — is well understood and bounds the downside. |
| 02-S02 | 5 | Two and a half times the anchor. The data change is small but pervasive: a second dimension on every transaction, every filter, and every total. Low unknowns, moderate complexity, no new technology — the cost is breadth rather than difficulty. |
| 02-S03 | 8 | Four times the anchor. Normalising inconsistent merchant descriptors and deciding what counts as confident enough to assign is genuine algorithmic work, and the requirement to leave uncertain transactions alone is harder than assigning a best guess. Unknowns are real: accuracy cannot be predicted before seeing live data. |
| 02-S04 | 5 | Comparable to 02-S02. Ordinary create-read-update work over a rule list, plus an evaluation order that must be visible and predictable. No new technology; complexity concentrated in making precedence understandable. |
| 02-S05 | 3 | Modestly above the anchor. It reuses the rule machinery from 02-S04 and adds a choice of scope and a retroactive pass. Small, but its three-way scope decision is more than the anchor's single write. |
| 02-S06 | 2 | Equal to the anchor. A filtered list, a count, and in-place editing, all over data and controls that already exist. No new technology, no unknowns. |
| 02-S07 | 3 | Modestly above the anchor, and small only because 02-S04 already supplies the rule machinery. The work is the interaction between two existing features — a rule must suppress a prompt — plus offering to create a default from the prompt itself and making silent filings visible and reversible. No new technology; the care is in not hiding transactions from the user. |
