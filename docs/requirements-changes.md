# Changes from the Initial Requirements

The design for the second deliverable departs from the 1-pagers in
[`one-pagers/`](one-pagers/) in the places below. The 1-pagers are left unchanged as the
record of the original requirements; this document records what the design does instead and
why.

## Changed behaviour

| Area | 1-pager | Design | Why |
|---|---|---|---|
| Classifying spending (02, 03) | One category and at most one spending group per transaction; budgets set per group | One category and any number of tags; a budget targets categories and/or tags, matching a transaction that has any of its tags | One tag model covers both questions the 1-pager asks, and a purchase can belong to more than one area |
| Currency (05) | Amounts never converted; each currency shown on its own; the user picks a display currency | USD is the base currency. CRC is converted at the BCCR rate of the transaction date, and the original amount, rate, and rate date are kept on every transaction | Totals and budgets can be precomputed in one currency, and the original amount stays checkable against the statement |
| Duplicates (01-S04) | Nothing merged without the user confirming | A transaction that arrives from both a Gmail alert and a CSV statement with the same amount, account, and date is merged automatically; near matches wait in the review inbox for the user | The same purchase arriving by two routes is the normal case, and confirming each one would make every import a chore |
| Getting transactions in (01) | Bank connections where offered, statement files with user column mapping, manual entry | Gmail Apps Script that forwards bank alert emails, CSV statements, and manual entry. Emails and statements are read by templates written for each bank | No Costa Rican bank was confirmed to offer personal-account access; templates are reliable for the banks the team uses |
| Supported banks (01) | Any institution | BAC Credomatic and Banco Nacional: one statement export and one card alert email each, specified in [`diagrams/bank-formats.md`](diagrams/bank-formats.md) with redacted samples in [`samples/`](samples/) | A template can only be written, and tested, against a real file; these are the two banks the team has samples from |
| Own-account transfers (05) | Paired and confirmed by the user (05-S03) | Statement rows that send money to an account whose IBAN the holder registered, or that come from the holder's own name, are imported as transfers and kept out of spending; pairing the two sides is still backlog | Moving money between one's own accounts is common (for example, topping up the colones account behind a debit card from a dollar account), and counting it would double the spending that the card alerts already record |
| Investment fees (07) | Fee profile with deposit gross-up, trade fees per asset class, and a withdrawal fee | Four investment transaction types (deposit, withdrawal, buy, sell). Each broker has a fee schedule: deposit, withdrawal, and buy and sell fees per asset class (stocks and ETFs, or crypto), each a flat amount plus a percentage. The schedule suggests the commission as each transaction is typed (deposits can be grossed up from the amount that arrived), the user can override it, and the "if I sold today" estimate applies the sell and withdrawal fees | The first design kept one rule per broker, which could not express a 1.55% deposit fee, a flat fee on funds, and a percentage on crypto at the same broker. The schedule is close to the 1-pager, and the override keeps the stored commission exact |
| Market prices (07) | Provider to be chosen | The Yahoo Finance chart API (no key) is the primary source, with Twelve Data as an optional fallback; quotes in other currencies are converted with Yahoo's exchange rates, and the last known price is kept 30 days to be shown as stale | Leaving the provider open meant prices never loaded; Yahoo covers stocks, ETFs, mutual funds, crypto, and non-US exchanges without a key |
| Budget periods (03-S10) | Week, month, or year | Week, month, quarter, year, or a custom date range | Small extension that reuses the same period logic |
| Prompts and warnings (02-S01, 03-S01) | Prompt at the time of the charge; warning before a budget runs out | Removed. Uncategorized transactions wait in an in-app review inbox | Delivering them needs push notifications, which are not part of the design |
| Presentation (all initiatives) | Each story states the figures its view must show; nothing fixes layout, page states, or wording | Every page is specified: the order of its sections, its headline figures, which chart answers which question, its loading, empty, and error states, forms in dialogs, and its wording. The components and charts are hand-written (Tailwind CSS, SVG) from one set of design tokens, with no component or chart library | The earlier generated versions computed the right numbers and presented them as stacked tables and forms. What a generator is not told, it improvises, and the result was hard to read at a glance, which is the dashboard's whole purpose |
| Dashboard month (04-S01) | The view shows last month | The dashboard and the transaction list open on the current month, or on the latest month with data when the current one is empty; last month is one step back | One rule for every month view. The two pages used to open on different months, and one of them opened empty |
| Investment views (07) | Figures only: value per holding, cost, and the net liquidation figure | The portfolio also shows how the value splits across holdings, each holding's value against what it cost, what part of the value fees would take on selling, and deposits and withdrawals by month, with each holding's gain | Each view answers a question the 1-pager already asks ("what a position has really cost me", "what I would actually receive"). All use recorded or current figures; none projects a future value |
| Price time (07-S02, 07-S05) | The time the price was retrieved | The time the market last traded at that price, with its date; the retrieval time is shown only as the age of a stale price | The page showed two different times for the same price. The market time is the one that tells a price from today apart from one from last week |
| Categories, tags, and settings (02, 03) | Categories and groups are assumed to exist; managing them is part of the rule editor | Sixteen built-in categories are seeded, the user adds their own categories and tags on a Settings page, and the day the week starts is a setting there | Budgets and filing need a list to pick from, and the earlier design did not say where it came from, so each generator invented one in a different place |

## Removed from scope

These stories were removed from the design: account balances and everything that depends
on them (01-S06, 03-S03, 03-S04, 07-S06); the institution list (01-S07); the rule editor and
the view of silently filed transactions (02-S04, 02-S07); prompts at the time of a charge
(02-S01); budget warnings, commitments, and the year-end saving figure (03-S01, 03-S06,
03-S12); shared household budgets (03-S07 to 03-S09, 04-S05); period comparison and
drill-through (04-S02, 04-S04); transfer pairing, account roles, and conversion cost (05-S03
to 05-S05); and device lock, export, deletion, recovery, and suppressing connection prompts
(06-S01, 06-S03 to 06-S06).

The non-functional requirements tied to those stories are removed with them. Offline manual
entry (01) is also removed: a transaction is saved only when the device is online.

## Platform

Finance App is built as a web application (Next.js) that works in a phone's browser, and
is deployed on AWS (CloudFront, Lambda, API Gateway, DynamoDB, S3, Cognito) rather than on a
platform such as Vercel or Railway.
