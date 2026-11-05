# 01 Accounts and Transaction Ingestion — Sequence Diagrams

Module 01 of the [context model](../context.md). These diagrams cover every way a
transaction enters the system: manual entry, CSV statements, and bank alert emails from
the Gmail script. All three end in the same `TransactionService.save` path (see the
[conventions](README.md#conventions)), so categorization, rollups, and budgets never need a
separate code path per source.

---

### 01-S02 — Import a CSV statement

**Story:** As Patricia, I want to import a statement file I downloaded from my bank so that
I can use the product without giving it access to my account.

The browser uploads the file straight to S3 with a presigned POST, so the file never passes
through a Lambda. The S3 event starts `ImportWorkerFn`, which runs the same `IngestPipeline`
that emails use. The file is matched to a bank template by its header row. Each row is
saved independently, and a bad row is reported with its reason while the rest import.

```mermaid
sequenceDiagram
    autonumber
    actor U as Patricia
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant Imp as ImportService
    participant Ing as Ingestion
    participant S3 as S3 raw-ingest
    participant W as ImportWorkerFn
    participant P as IngestPipeline
    participant T as TemplateRegistry
    participant TS as TransactionService

    U->>UI: Pick account and CSV file
    UI->>UI: Compute SHA-256 of the file
    UI->>Web: startImport(accountId, fileName, sha256)
    Web->>API: POST /api/imports
    API->>Imp: createImport(userId, accountId, sha256)
    Imp->>Ing: Put FILE#sha256 (attribute_not_exists)
    alt Same file already imported
        Ing-->>Imp: ConditionalCheckFailed
        Imp-->>UI: 409 already imported
    else New file
        Imp->>Ing: Put IMPORT#id (status UPLOADING)
        Imp->>S3: Create presigned POST imports/userId/id.csv (max 1 MB)
        Imp-->>UI: importId + upload form
        UI->>S3: Upload file
        S3-)W: ObjectCreated event
        W->>Ing: Update IMPORT#id (status PROCESSING)
        W->>P: processCsv(importId)
        P->>T: detect(header row)
        alt No bank template matches
            P->>Ing: Update IMPORT#id (status FAILED, no template for this file)
        else Template found
            loop Each row
                P->>P: Parse with template, validate (Zod)
                alt Row invalid
                    P->>Ing: Append row error (row number, reason)
                else Row fingerprint already seen
                    P->>Ing: Count as overlap, skip
                else Valid new row
                    P->>Ing: Put ROWFP#hash
                    P->>TS: save(parsed row) or merge with an email match
                end
            end
            P->>Ing: Update IMPORT#id (DONE, imported, merged, skipped, errors)
        end
        loop Every 2 s until DONE or FAILED
            UI->>Web: GET /api/imports/id
            Web->>API: GET /api/imports/id
            API->>Ing: Get IMPORT#id
            API-->>UI: status and counts
        end
        UI-->>U: Summary with each unreadable row and its reason
    end
```

Re-running a failed import is safe because every row is keyed by its fingerprint, so an
interrupted import resumes rather than creating duplicates.

---

### 01-S03 — Add a transaction by hand

**Story:** As Daniela, I want to add a transaction by hand in a few seconds so that I can
record a cash payment before I forget it.

```mermaid
sequenceDiagram
    autonumber
    actor U as Daniela
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant TS as TransactionService
    participant Fx as FxService
    participant Cat as Categorizer
    participant BM as BudgetMatcher
    participant Ref as Reference
    participant DB as Transactions + Aggregates

    U->>UI: Enter amount (date defaults to today, currency to the account's)
    UI->>Web: createTransaction(input)
    Web->>API: POST /api/transactions
    API->>API: Validate body (Zod)
    API->>TS: create(userId, input)
    TS->>Fx: toUsd(amount, currency, localDate)
    Note right of Fx: Cached rate or BCCR fetch, see 05-S02
    alt Rate unavailable
        Fx-->>TS: FxUnavailableError
        TS-->>UI: 503, nothing saved, user can retry
    else Rate available
        Fx-->>TS: amountUsdCents, fxRate, fxDate
        TS->>Cat: categorize(merchantKey)
        Note right of Cat: See 02-S03
        Cat-->>TS: category and tags, or Uncategorized
        TS->>Ref: Query BUDGET# (user budgets)
        TS->>BM: matching(transaction, budgets)
        BM-->>TS: matching budgets and their period keys
        TS->>DB: TransactWriteItems
        Note right of DB: Put TXN, ADD DAY, MONTH, CAT, TAG,<br/>and budget P#, D# items
        DB-->>TS: OK
        TS-->>UI: 201 transaction
    end
```

---

### 01-S04 — Review possible duplicates

**Story:** As Ezequiel, I want to be shown transactions that look like duplicates of each
other so that I can keep one record per purchase when the same charge arrives by two
routes.

Exact matches between an email and a statement row are merged by the pipeline (01-S08b).
Near matches (same account and date window, different amount) are saved with
`possibleDuplicateOf` and wait in the review inbox for Ezequiel to decide.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant RS as ReviewService
    participant TS as TransactionService
    participant Tx as Transactions

    U->>UI: Open review inbox
    UI->>Web: GET /api/review?type=duplicates
    Web->>API: GET /api/review?type=duplicates
    API->>RS: listDuplicates(userId)
    RS->>Tx: Query review GSI (reviewPK = USER#id, reason DUPLICATE)
    RS-->>UI: Pairs with amount, currency, date, account, sources
    alt Merge
        U->>UI: Keep A, merge B into it
        UI->>Web: POST /api/review/duplicates/merge {keepId, dropId}
        Web->>API: POST /api/review/duplicates/merge
        API->>TS: merge(userId, keepId, dropId)
        TS->>Tx: Get both (with versions)
        TS->>TS: Combine sources, keep richest fields, keep user-set category
        TS->>Tx: TransactWriteItems
        Note right of Tx: Update A (version check), delete B,<br/>subtract B from every rollup and budget
        TS-->>UI: 200 merged
    else Not duplicates
        U->>UI: Keep both
        UI->>Web: POST /api/review/duplicates/dismiss {id}
        Web->>API: POST /api/review/duplicates/dismiss
        API->>RS: dismiss(userId, id)
        RS->>Tx: Remove possibleDuplicateOf and reviewPK
        RS-->>UI: 200
    end
```

---

### 01-S05 — Record incoming money

**Story:** As Andrés, I want to record a payment that has arrived from a client so that I
can have money coming in counted as well as money going out.

Income uses the same save path with `kind = income`. Rollups add it to `incomeCents`
instead of `expenseCents`, so it never appears as spending.

```mermaid
sequenceDiagram
    autonumber
    actor U as Andrés
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant TS as TransactionService
    participant Fx as FxService
    participant DB as Transactions + Aggregates

    U->>UI: Choose "Money in", account, amount, currency, date received
    UI->>Web: createTransaction(kind income, ...)
    Web->>API: POST /api/transactions
    API->>TS: create(userId, input)
    TS->>Fx: toUsd(amount, currency, receivedDate)
    Fx-->>TS: amountUsdCents, rate, rate date
    TS->>DB: TransactWriteItems
    Note right of DB: Put TXN (kind income),<br/>ADD incomeCents on DAY, MONTH, CAT.<br/>Budgets are not affected.
    DB-->>TS: OK
    TS-->>UI: 201 transaction (original currency and USD)
```

---

### 01-S08a — Connect Gmail

**Story:** As Ezequiel, I want to authorise a connection to an institution that supports
one so that I can have its transactions arrive without my typing them.

The connection is the Gmail Apps Script. The product never sees a Gmail or bank password.
It issues a random ingest token, stores only its hash, and the token can be revoked at any
time (06-S02).

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant CS as ConnectionService
    participant Ing as Ingestion
    participant GS as Gmail Apps Script

    U->>UI: Connect Gmail
    UI->>Web: POST /api/connections/gmail
    Web->>API: POST /api/connections/gmail
    API->>CS: createGmail(userId)
    CS->>CS: Generate 32-byte random token, hash = SHA-256(token)
    CS->>Ing: TransactWriteItems
    Note right of Ing: Put CONN#gmail#id (PENDING, tokenPrefix),<br/>Put TOKEN#hash (userId, connId)
    CS-->>UI: Token (shown once) and script
    U->>GS: Paste script, store token in PropertiesService, run setup()
    GS->>API: GET /ingest/gmail/config (Bearer token)
    API->>CS: authenticate(token)
    CS->>Ing: Get TOKEN#SHA-256(token)
    alt Unknown or revoked token
        CS-->>GS: 401
        GS-->>U: Setup failed, CSV import and manual entry still work
    else Valid
        CS->>Ing: Update CONN#gmail#id (ACTIVE, lastSeenAt)
        CS-->>GS: Bank sender allowlist
        GS->>GS: Create 5-minute time trigger
        GS-->>U: Connected
    end
```

### 01-S08b — Gmail delivers a bank alert

Every 5 minutes the script sends new bank emails. An email is labelled as processed only
after a `2xx`, so a failed call is retried on the next run.

```mermaid
sequenceDiagram
    autonumber
    participant GS as Gmail Apps Script
    participant API as ApiFn router
    participant CS as ConnectionService
    participant S3 as S3 raw-ingest
    participant P as IngestPipeline
    participant Ing as Ingestion
    participant DK as DkimVerifier
    participant T as TemplateRegistry
    participant DM as DuplicateMatcher
    participant TS as TransactionService

    GS->>GS: Search allowlisted senders without label yourapp-processed
    loop Each email
        GS->>API: POST /ingest/gmail (Bearer token, raw MIME)
        API->>CS: authenticate(token)
        CS->>Ing: Get TOKEN#hash, update lastSeenAt
        API->>S3: Put raw/userId/messageId.eml
        API->>P: processEmail(userId, rawRef)
        P->>Ing: Put MSG#messageId (attribute_not_exists)
        alt Already processed
            P-->>GS: 200 duplicate
        else New
            P->>DK: verify(raw MIME, allowlisted domain)
            alt DKIM fails or sender not allowed
                P->>Ing: Update MSG# (rejected)
                P-->>GS: 200 rejected
            else Verified
                P->>T: match(sender, subject)
                alt No template matches
                    P->>Ing: Update MSG# (unparsed, shown in review inbox)
                    P-->>GS: 200 unparsed
                else Template matches
                    P->>P: Parse, validate, normalize merchant and account (last 4)
                    P->>DM: findMatch(account, original amount, date window)
                    alt Exact match from a statement
                        P->>TS: merge(existing, email fields)
                    else Near match
                        P->>TS: save(flagged possibleDuplicateOf)
                    else No match
                        P->>TS: save(transaction)
                    end
                    P->>Ing: Update MSG# (imported, transactionId)
                    P-->>GS: 200 imported
                end
            end
        end
        GS->>GS: Add label yourapp-processed
    end
    GS->>API: POST /ingest/gmail/heartbeat
    Note over GS,API: A 5xx response leaves the email unlabelled,<br/>so it is sent again on the next run
```

---

### 01-S09 — Detect a stale connection

**Story:** As Ezequiel, I want to be told when a connection has stopped working so that I
can notice before I rely on figures that quietly stopped updating.

Staleness is computed when the app opens, from the heartbeat the script sends on every run,
so a week without purchases does not look like a broken connection.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant CS as ConnectionService
    participant Ing as Ingestion

    U->>UI: Open dashboard
    UI->>Web: GET /api/connections
    Web->>API: GET /api/connections
    API->>CS: list(userId)
    CS->>Ing: Query CONN#
    CS->>CS: stale = now - lastSeenAt > 24 h
    CS-->>UI: Connections with status and lastSeenAt
    alt Gmail connection is stale
        UI-->>U: Banner "Your Gmail connection stopped on Oct 29. Reconnect?"
        U->>UI: Reconnect
        UI->>Web: POST /api/connections/gmail/id/rotate
        Web->>API: POST /api/connections/gmail/id/rotate
        API->>CS: rotate(userId, connId)
        CS->>Ing: TransactWriteItems
        Note right of Ing: Delete old TOKEN#hash, put new TOKEN#hash,<br/>set CONN# PENDING
        CS-->>UI: New token, continue as in 01-S08a
    end
```
