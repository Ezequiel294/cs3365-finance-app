# {{PRODUCT_NAME}} — Product Documentation

This directory holds the documents that define what {{PRODUCT_NAME}} is for and who it
serves. The rules governing how these documents are written, read, and updated live in
`openspec/specs/documentation/`. Read the relevant capability there before authoring or
revising anything here.

The product name has not been chosen. Until it is, every document refers to the product
as `{{PRODUCT_NAME}}`, so a single substitution pass will name it everywhere at once.

## Index

| Document | Covers |
|---|---|
| [`vision.md`](vision.md) | What the product is, who it is for, and why they would choose it over a spreadsheet or an existing tracker |
| [`personas.md`](personas.md) | The five people the product is built for, the requirement each is uniquely responsible for, and the user types deliberately excluded |
| [`sizing.md`](sizing.md) | The effort metric, the baseline anchor, the estimation dimensions, and the roll-up of every story |
| [`one-pagers/`](one-pagers/) | One document per initiative: the situation it addresses, the assumptions behind it, its stories, its non-functional requirements, and its sizing |
| [`drafts/`](drafts/) | Superseded versions of documents, retained with a note of what changed and why |

### 1-Pagers

| Document | Initiative |
|---|---|
| [`01-accounts-and-transaction-ingestion.md`](one-pagers/01-accounts-and-transaction-ingestion.md) | Accounts and Transaction Ingestion |
| [`02-categorization-and-rules.md`](one-pagers/02-categorization-and-rules.md) | Categorization and Rules |
| [`03-budgets-and-limits.md`](one-pagers/03-budgets-and-limits.md) | Budgets and Limits |
| [`04-dashboard-and-insights.md`](one-pagers/04-dashboard-and-insights.md) | Dashboard and Insights |
| [`05-multi-currency-and-fx.md`](one-pagers/05-multi-currency-and-fx.md) | Multi-Currency and Account Roles |
| [`06-security-and-data-control.md`](one-pagers/06-security-and-data-control.md) | Security and Data Control |
| [`07-investments-and-net-worth.md`](one-pagers/07-investments-and-net-worth.md) | Investments and Net Worth |

### Drafts

| Document | Superseded by |
|---|---|
| [`drafts/vision-v1.md`](drafts/vision-v1.md) | `drafts/vision-v2.md` — the UNLIKE clause named competitors the user had never actually tried |
| [`drafts/vision-v2.md`](drafts/vision-v2.md) | `vision.md` — removed a geographic constraint, a timing promise the product cannot keep, and an adjective standing in for a behaviour |
| [`drafts/personas-v1.md`](drafts/personas-v1.md) | `personas.md` — a fifth persona was added after being tested against the existing four for overlap |

## Implementation Status

Status is **derived**, never hand-maintained. A story is *implemented* when a requirement
in `openspec/specs/` cites its identifier, *in progress* when only a requirement in an
active change under `openspec/changes/` cites it, and *not started* when nothing cites it.
If this table and the specs disagree, the specs are correct and this table is stale.

Refresh it whenever a change is archived.

| 1-Pager | Initiative | Stories | Not started | In progress | Implemented |
|---|---|---|---|---|---|
| [`01-accounts-and-transaction-ingestion.md`](one-pagers/01-accounts-and-transaction-ingestion.md) | Accounts and Transaction Ingestion | 8 | 8 | 0 | 0 |
| [`02-categorization-and-rules.md`](one-pagers/02-categorization-and-rules.md) | Categorization and Rules | 7 | 7 | 0 | 0 |
| [`03-budgets-and-limits.md`](one-pagers/03-budgets-and-limits.md) | Budgets and Limits | 11 | 11 | 0 | 0 |
| [`04-dashboard-and-insights.md`](one-pagers/04-dashboard-and-insights.md) | Dashboard and Insights | 6 | 6 | 0 | 0 |
| [`05-multi-currency-and-fx.md`](one-pagers/05-multi-currency-and-fx.md) | Multi-Currency and Account Roles | 6 | 6 | 0 | 0 |
| [`06-security-and-data-control.md`](one-pagers/06-security-and-data-control.md) | Security and Data Control | 6 | 6 | 0 | 0 |
| [`07-investments-and-net-worth.md`](one-pagers/07-investments-and-net-worth.md) | Investments and Net Worth | 6 | 6 | 0 | 0 |
| | **Total** | **50** | **50** | **0** | **0** |

2 further stories (`01-S01`, `03-S05`) were split and carry no estimate; they are
tracked through the stories that replaced them, not on their own.

No product capability specs exist yet, so every story is correctly reported as not
started. `openspec list` shows what is currently in flight.
