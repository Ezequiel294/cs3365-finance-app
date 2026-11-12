# 02 Categorization and Rules — Sequence Diagrams

Module 02 of the [context model](../context.md). A transaction has one category and any
number of tags, drawn from the same `CAT#` and `TAG#` items that budgets use (the seeded
global categories under `PK = GLOBAL`, and the user's own categories and tags under
`PK = USER#id`; see [02-S02a](#02-s02a--list-and-create-categories-and-tags)). Categorization uses rules
keyed by normalized merchant, `RULE#<merchantKey>`: the user's own rules first, then global
rules. Anything no rule settles goes to the review inbox, and correcting it can save a rule
so the same merchant files itself next time.

Every category change goes through `TransactionService.update`, which moves the amount
between the old and new category, tag, and budget rollups in one `TransactWriteItems`
(see the [conventions](README.md#conventions)).

---

### 02-S02 — Set category and tags

**Story:** As Ezequiel, I want to give a transaction both a category and tags so that I can
ask what I spent on food and what my university living cost me without the two answers
competing.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant TS as TransactionService
    participant Ref as Reference
    participant Tx as Transactions
    participant BM as BudgetMatcher
    participant DB as Transactions + Aggregates

    U->>UI: Transactions, open a row (TransactionDialog):<br/>category Groceries, tag University (ChipSelect)
    UI->>Web: PATCH /api/transactions/id {categoryId, tagIds}
    Web->>API: PATCH /api/transactions/id
    API->>TS: update(userId, id, changes, by user)
    TS->>Ref: Get CAT# and TAG# items (GLOBAL or this user, not archived)
    alt Unknown or other user's ID
        TS-->>UI: 400 invalid category or tag
    else Valid
        TS->>Tx: Get TXN (with version)
        TS->>BM: matching(old transaction) and matching(new transaction)
        TS->>TS: Delta = subtract old CAT, TAG, budget buckets, add new ones
        TS->>DB: TransactWriteItems (version = read version)
        Note right of DB: Update TXN (categoryId, tagIds,<br/>categorizedBy user, version + 1),<br/>ADD negative and positive deltas
        alt Version changed meanwhile
            DB-->>TS: TransactionCanceled
            TS->>Tx: Re-read and retry once
        end
        TS-->>UI: 200 transaction
        UI-->>U: Dialog closes, the row shows a Groceries badge and a University badge
    end
```

Totals by category or by tag come from the `MONTH#...#CAT#` and `MONTH#...#TAG#` rollups
(see 04-S01 and 04-S03).

---

### 02-S02a — List and create categories and tags

**Story (supporting 02-S02 and 03-S02):** As Ezequiel, I want to see the categories and
tags I can use and add my own so that I can file a purchase, or set a budget, under a name
that means something to me.

Every category select and tag picker in the product reads the same catalog: the global
categories that were seeded when the product was deployed, then the user's own categories
and tags. New ones are created on the Settings page, which is also where the week-start day
lives (see [03-S10](03-budgets-and-limits.md#03-s10--change-a-budgets-period)).

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant CtS as CatalogService
    participant Ref as Reference

    U->>UI: More, Settings
    UI->>Web: Render /settings
    Web->>API: GET /api/catalog
    API->>CtS: list(userId)
    CtS->>Ref: Query GLOBAL begins_with CAT#
    CtS->>Ref: Query USER#id begins_with CAT# and begins_with TAG#
    CtS-->>Web: Catalog: categories (global, then own) and tags, sorted by name, not archived
    Web-->>UI: SettingsPage: Preferences, Categories, and Tags sections (CatalogEditor)
    UI-->>U: Built-in categories with a "Built-in" badge, own categories, own tags
    U->>UI: New tag "University", Add
    UI->>Web: createTag("University")
    Web->>API: POST /api/tags {name}
    API->>API: Validate (Zod): name trimmed, 1 to 40 characters
    API->>CtS: createTag(userId, "University")
    CtS->>Ref: Query USER#id begins_with TAG#
    alt A tag with that name exists (ignoring case)
        CtS-->>UI: 409
        UI-->>U: Under the field: "You already have a tag called University."
    else Free
        CtS->>Ref: Put USER#id / TAG#id (name, scope user)
        CtS-->>UI: 201 tag
        UI-->>U: The tag appears in the list and in every tag picker
    end
    Note over UI,Ref: POST /api/categories works the same way and also checks<br/>the name against the global categories
```

The transaction dialog, the review inbox, and the budget dialog call the same
`GET /api/catalog` for their options. "Uncategorized" is not in the catalog: it is what a
transaction without a category is called. No rule or fallback files a transaction under
"Other" by itself; only the user chooses it.

---

### 02-S03 — Categorize automatically

**Story:** As Daniela, I want to have my transactions sorted into categories without doing
it myself so that I can see where my week went without filing anything.

This is the `Categorizer` step used by the ingest pipeline and by manual entry. It is
deterministic: the same merchant and rule set always give the same result, and the rule
that decided is recorded on the transaction.

```mermaid
sequenceDiagram
    autonumber
    participant P as IngestPipeline
    participant N as Normalizer
    participant C as Categorizer
    participant Ref as Reference
    participant TS as TransactionService

    P->>N: normalize("AUTOMERCADO ESCAZU 042")
    N-->>P: merchantKey "automercado"
    P->>C: categorize(userId, merchantKey)
    C->>Ref: Get USER#id / RULE#automercado
    alt User rule exists
        C-->>P: category, tags, kind if the rule sets one, categorizedBy rule, status confirmed
    else No user rule
        C->>Ref: Get GLOBAL / RULE#automercado
        alt Global rule exists
            C-->>P: category, tags, categorizedBy global, status confirmed
        else No rule
            C-->>P: Uncategorized, status pending_review (sets reviewPK)
        end
    end
    P->>TS: save(transaction with result)
    Note over C,TS: When merging into an existing transaction,<br/>a category with categorizedBy user is never replaced
```

---

### 02-S05 — Correct and remember

**Story:** As Ezequiel, I want to correct a categorization and have that correction
remembered so that I can fix a mistake once rather than every month.

A correction can save a user rule for the merchant. The rule applies to transactions that
arrive from then on; past transactions keep their category. A rule can also remember the
**kind**: when the user changes a transaction's kind, for example the BAC statement row
`DTR:inversiones_hapi_VT` from `payment_sent` to `transfer` because it is money sent to their
own broker account, the same prompt offers to remember it, and later rows from that merchant
arrive as transfers that stay out of spending.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant TS as TransactionService
    participant RlS as RuleService
    participant Ref as Reference

    U->>UI: Change category of a "Spotify" charge to Subscriptions
    UI->>Web: PATCH /api/transactions/id {categoryId}
    Web->>API: PATCH /api/transactions/id
    API->>TS: update(userId, id, {categoryId}, by user)
    TS-->>UI: 200, removed from review inbox
    UI-->>U: The dialog (or the Review toast) asks<br/>"Always file Spotify as Subscriptions?" with "Always" and "Only this one"
    alt Yes
        U->>UI: Yes
        UI->>Web: PUT /api/rules/spotify {categoryId, tagIds, kind if it was changed}
        Web->>API: PUT /api/rules/spotify
        API->>RlS: upsert(userId, "spotify", categoryId, tagIds, kind)
        RlS->>Ref: Put USER#id / RULE#spotify
        RlS-->>UI: 200 rule
        Note over UI,Ref: The next Spotify charge is filed by 02-S03<br/>without entering the review inbox
    else Only this one
        U->>UI: No
    end
```

---

### 02-S06 — Clear the review inbox

**Story:** As Daniela, I want to find the transactions that have not been categorized so
that I can clear them in one sitting instead of hunting for them.

The review GSI is sparse: a transaction carries `reviewPK` only while it needs a decision,
so the list and its count are one query. Emails that matched no template (`MSG#` items
with status `unparsed`) are shown in the same inbox.

```mermaid
sequenceDiagram
    autonumber
    actor U as Daniela
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant RS as ReviewService
    participant Tx as Transactions
    participant Ing as Ingestion
    participant TS as TransactionService

    U->>UI: Open Review from the nav (badge "12") or the Dashboard's "To review" tile
    UI->>Web: GET /api/review
    Web->>API: GET /api/review
    API->>RS: list(userId)
    RS->>Tx: Query review GSI (reviewPK = USER#id)
    RS->>Ing: Query MSG# with status unparsed
    RS-->>UI: Pending transactions, unparsed emails, and the count
    Note over UI: ReviewInbox, Tabs with counts: To categorize,<br/>Possible duplicates, Emails not understood.<br/>With a count of 0 the page shows one "All caught up" EmptyState
    loop Each transaction, without opening it
        U->>UI: Pick category from the row's dropdown
        UI->>Web: PATCH /api/transactions/id {categoryId}
        Web->>API: PATCH /api/transactions/id
        API->>TS: update(userId, id, {categoryId}, by user)
        TS->>Tx: Update TXN, remove reviewPK (with rollup deltas)
        TS-->>UI: 200
        UI->>UI: Remove row, tab count and nav badge go down by one,<br/>toast "Filed under Groceries" with the action "Always file Automercado this way"
    end
```
