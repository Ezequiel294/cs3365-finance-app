# Requirements Sizing

## Metric

Effort is estimated in **story points** — an arbitrary, relative measure — and the same
metric is used for every story in this product. Story points are used rather than
person-hours or person-days because a point means the same thing regardless of who
implements the story, while a person-day does not: the same work takes different people
different amounts of time, and mixing the two makes estimates incomparable across the
product.

Nothing here is expressed in hours, days, or calendar time, and no estimate below is a
commitment to a date.

## Scale

Sizes are drawn from the modified Fibonacci scale, and no other value may be assigned:

**1 · 2 · 3 · 5 · 8 · 13**

The gaps widen deliberately. Distinguishing a 5 from an 8 is a judgement people can
actually make; distinguishing a 6 from a 7 is not, and a finer scale invites false
precision.

## Baseline Anchor

> **`01-S03` — "As Daniela, I want to add a transaction by hand in a few seconds" — is the
> baseline anchor, fixed at 2 points.**

Every other estimate in this product is made by comparison against it. It was chosen
because it is the smallest story that still does something complete and user-visible: one
form, three fields, a local write, and sensible defaults, with no new technology, no
external dependency, and nothing unknown about it.

If the anchor is ever re-sized, every estimate derived from it must be re-examined,
because all of them are relative to this one number.

## Estimation Dimensions

Each estimate is formed by considering four dimensions together. An estimate that
accounts only for how much work there is has not been done properly.

| | **Size** | **Complexity** | **Technology** | **Unknowns** |
|---|---|---|---|---|
| **1–2** | One screen or form | Straightforward create, read, update | Entirely familiar | None |
| **3** | Two or three screens, some shared state | Some derived or conditional logic | One unfamiliar library | Minor |
| **5** | Cross-cutting within one area | Non-trivial rules, ordering, or precedence | A new integration with documented behaviour | Real but bounded |
| **8** | Spans several areas of the product | Algorithmic work, or correctness that is hard to verify | New technology whose behaviour is unproven | Substantial |
| **13** | — | — | — | **Too large to estimate. Must be split.** |

## Splitting

A story sized at 13 is treated as too large to estimate reliably and is split. The
original story stays in its 1-pager — it still states a real need — but carries no
estimate and is marked as replaced.

| Split story | Replaced by | Why it exceeded the threshold |
|---|---|---|
| `01-S01` Connect an account at my bank | `01-S07`, `01-S08`, `01-S09` | Unknowns dominated. No institution is confirmed to offer third-party access to an individual's accounts, and the single sentence hid discovery, consent, token storage, refresh, and failure handling. |
| `03-S05` Share a household budget | `03-S07`, `03-S08`, `03-S09` | Size and complexity both large, with structural unknowns: a second identity, an invitation flow, an authorization boundary that must hold under revocation, and a visibility rule every existing query must respect. |

Split stories take the next unused identifiers in their 1-pager. Identifiers are never
reused or reassigned.

## How Certain These Are

These are **first-pass relative estimates made from an incomplete requirements definition
by a team with no velocity history for this product.** Estimates made under those
conditions are routinely wrong by a wide margin in both directions — startup estimates of
this kind commonly land anywhere between a quarter and four times the eventual actual —
and they are expected to be re-estimated as the work becomes better understood.

They are useful for one thing: comparing stories against each other, to decide what to do
first and what to break down further. They are not a schedule, not a delivery date, and
not a commitment. Any use of them to predict when something will be finished is a misuse.

`01-S08` carries a further caveat. It is sized provisionally at 8 because the
investigation that would bound it has not been carried out, and it may turn out not to be
buildable at all. It is re-estimated when that investigation returns.

## Roll-Up

52 stories across 7 initiatives. 50 carry an estimate;
2 are split parents and carry none.

**Total estimated effort: 230 points.** Distribution: **2** × 2 · **3** × 19 · **5** × 21 · **8** × 8.

Two stories assigned the same size represent comparable effort regardless of which
1-pager they appear in. Where review finds two equally sized stories that plainly differ,
one of them is re-sized and its rationale updated.

| Story | 1-Pager | Persona | Wants to | Points |
|---|---|---|---|---|
| `01-S01` | 01 | Ezequiel | connect an account at my bank | — (split) |
| `01-S02` | 01 | Patricia | import a statement file I downloaded from my bank | 8 |
| `01-S03` | 01 | Daniela | add a transaction by hand in a few seconds | 2 |
| `01-S04` | 01 | Ezequiel | be shown transactions that look like duplicates of each other | 5 |
| `01-S05` | 01 | Andrés | record a payment that has arrived from a client | 3 |
| `01-S06` | 01 | Ezequiel | see every account I hold and its current balance in one list | 3 |
| `01-S07` | 01 | Ezequiel | see which of my institutions can be connected and which cannot | 3 |
| `01-S08` | 01 | Ezequiel | authorise a connection to an institution that supports one | 8 |
| `01-S09` | 01 | Ezequiel | be told when a connection has stopped working | 3 |
| `02-S01` | 02 | Ezequiel | be asked which group a charge belongs to at the time it is cha… | 8 |
| `02-S02` | 02 | Ezequiel | give a transaction both a category and a spending group | 5 |
| `02-S03` | 02 | Daniela | have my transactions sorted into categories without doing it m… | 8 |
| `02-S04` | 02 | Ezequiel | create a rule that files matching transactions automatically | 5 |
| `02-S05` | 02 | Ezequiel | correct a categorization and have that correction remembered | 3 |
| `02-S06` | 02 | Daniela | find the transactions that have not been categorized | 2 |
| `02-S07` | 02 | Keisy | have transactions whose category is already settled filed with… | 3 |
| `03-S01` | 03 | Daniela | be warned that I am running down the money I had for the month | 5 |
| `03-S02` | 03 | Ezequiel | set a separate limit for each spending group | 3 |
| `03-S03` | 03 | Andrés | see how much I can safely spend this period | 8 |
| `03-S04` | 03 | Andrés | see how long my current money lasts at my current rate of spen… | 5 |
| `03-S05` | 03 | Patricia | share a household budget with my partner | — (split) |
| `03-S06` | 03 | Ezequiel | confirm which of my recurring costs are commitments | 5 |
| `03-S07` | 03 | Patricia | invite my partner to a budget | 5 |
| `03-S08` | 03 | Patricia | see who paid for each transaction in our shared budget | 3 |
| `03-S09` | 03 | Patricia | end sharing whenever I decide to | 5 |
| `03-S10` | 03 | Keisy | set a budget over a week, a month, or a year | 5 |
| `03-S11` | 03 | Keisy | see what proportion of each budget I have used, including when… | 3 |
| `03-S12` | 03 | Keisy | see what I would have saved by the end of the year if I stay i… | 5 |
| `04-S01` | 04 | Daniela | see where last month's money went | 5 |
| `04-S02` | 04 | Ezequiel | compare a period against the ones before it | 5 |
| `04-S03` | 04 | Ezequiel | see spending broken down by group as well as by category | 3 |
| `04-S04` | 04 | Daniela | open a part of a chart and see the transactions behind it | 5 |
| `04-S05` | 04 | Patricia | see our household spending split by who spent it | 3 |
| `04-S06` | 04 | Andrés | see my income alongside my spending over time | 3 |
| `05-S01` | 05 | Ezequiel | see every amount in the currency it actually occurred in | 5 |
| `05-S02` | 05 | Ezequiel | choose a currency for my totals and see which rate produced th… | 5 |
| `05-S03` | 05 | Ezequiel | mark two movements as a transfer between my own accounts | 8 |
| `05-S04` | 05 | Ezequiel | give each of my accounts a role | 3 |
| `05-S05` | 05 | Ezequiel | see what a currency conversion actually cost me | 5 |
| `05-S06` | 05 | Patricia | import a statement in a currency and have it stay in that curr… | 3 |
| `06-S01` | 06 | Patricia | use every part of the product without linking any account | 3 |
| `06-S02` | 06 | Patricia | see exactly what the product can currently access and withdraw… | 8 |
| `06-S03` | 06 | Ezequiel | require my device's own lock before the product opens | 3 |
| `06-S04` | 06 | Patricia | take all my data out in a format I can open elsewhere | 5 |
| `06-S05` | 06 | Patricia | delete my data and know it is gone | 8 |
| `06-S06` | 06 | Daniela | get back into my account if I lose my phone | 5 |
| `07-S01` | 07 | Ezequiel | record what I hold by entering it myself | 3 |
| `07-S02` | 07 | Ezequiel | see my holdings valued at current market prices | 5 |
| `07-S03` | 07 | Ezequiel | describe the fees my broker charges | 5 |
| `07-S04` | 07 | Ezequiel | record a contribution with the fees it actually incurred | 5 |
| `07-S05` | 07 | Ezequiel | see what I would actually receive if I sold everything today | 3 |
| `07-S06` | 07 | Ezequiel | see my accounts and my holdings in one total | 3 |

### By initiative

| 1-Pager | Initiative | Stories | Points |
|---|---|---|---|
| `01` | Accounts and Transaction Ingestion | 9 | 35 |
| `02` | Categorization and Rules | 7 | 34 |
| `03` | Budgets and Limits | 12 | 52 |
| `04` | Dashboard and Insights | 6 | 24 |
| `05` | Multi-Currency and Account Roles | 6 | 29 |
| `06` | Security and Data Control | 6 | 32 |
| `07` | Investments and Net Worth | 6 | 24 |
| | **Total** | **52** | **230** |

### By persona

| Persona | Stories | Points |
|---|---|---|
| Ezequiel | 26 | 112 |
| Patricia | 11 | 51 |
| Daniela | 7 | 32 |
| Andrés | 4 | 19 |
| Keisy | 4 | 16 |
