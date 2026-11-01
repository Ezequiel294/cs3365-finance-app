# 02 Categorization and Rules — Sequence Diagrams

Module 02 of the [context model](../context.md). A transaction has one category and any
number of tags, drawn from the same `CAT#` and `TAG#` items that budgets use (global ones
under `PK = GLOBAL` and the user's own under `PK = USER#id`). Categorization uses rules
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

    U->>UI: Open transaction, set category Groceries, add tag University
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
        UI-->>U: Both shown on the transaction, editable later
    end
```

Totals by category or by tag come from the `MONTH#...#CAT#` and `MONTH#...#TAG#` rollups
(see 04-S01 and 04-S03).

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
        C-->>P: category, tags, categorizedBy rule, status confirmed
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
arrive from then on; past transactions keep their category.

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
    UI-->>U: "Always file Spotify as Subscriptions?"
    alt Yes
        U->>UI: Yes
        UI->>Web: PUT /api/rules/spotify {categoryId, tagIds}
        Web->>API: PUT /api/rules/spotify
        API->>RlS: upsert(userId, "spotify", categoryId, tagIds)
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

    U->>UI: Tap "12 to review" on the main view
    UI->>Web: GET /api/review
    Web->>API: GET /api/review
    API->>RS: list(userId)
    RS->>Tx: Query review GSI (reviewPK = USER#id)
    RS->>Ing: Query MSG# with status unparsed
    RS-->>UI: Pending transactions, unparsed emails, and the count
    loop Each transaction, without opening it
        U->>UI: Pick category from the row's dropdown
        UI->>Web: PATCH /api/transactions/id {categoryId}
        Web->>API: PATCH /api/transactions/id
        API->>TS: update(userId, id, {categoryId}, by user)
        TS->>Tx: Update TXN, remove reviewPK (with rollup deltas)
        TS-->>UI: 200
        UI->>UI: Remove row, count goes down by one
    end
```
