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
| Investment fees (07) | Fee profile with deposit gross-up, trade fees per asset class, and a withdrawal fee | Four investment transaction types (deposit, withdrawal, buy, sell), each recording the commission actually charged. Each broker has one commission rule (flat and/or percentage) used to estimate the cost of selling | Recording the real commission is exact and simpler than deriving it; the rule is only needed for the "if I sold today" estimate |
| Budget periods (03-S10) | Week, month, or year | Week, month, quarter, year, or a custom date range | Small extension that reuses the same period logic |
| Prompts and warnings (02-S01, 03-S01) | Prompt at the time of the charge; warning before a budget runs out | Removed. Uncategorized transactions wait in an in-app review inbox | Delivering them needs push notifications, which are not part of the design |

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

{{PRODUCT_NAME}} is built as a web application (Next.js) that works in a phone's browser, and
is deployed on AWS (CloudFront, Lambda, API Gateway, DynamoDB, S3, Cognito) rather than on a
platform such as Vercel or Railway.
