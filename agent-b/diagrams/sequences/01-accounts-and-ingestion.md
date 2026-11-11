# 01 Accounts and Transaction Ingestion — Sequence Diagrams

Module 01 of the [context model](../context.md). These diagrams cover every way a
transaction enters the system: manual entry, CSV statements, and bank alert emails from
the Gmail script. All three end in the same `TransactionService.save` path (see the
[conventions](README.md#conventions)), so categorization, rollups, and budgets never need a
separate code path per source.

Two banks are supported, **BAC Credomatic** and **Banco Nacional**. The exact layout of their
statement files and alert emails, the rules that read them, and the result expected from
each redacted sample are in [Bank Formats](../bank-formats.md). The diagrams below name
those rules but do not repeat them.

---

### 01-S02a — Register an account

**Story (supporting 01-S02 and 01-S08):** As Ezequiel, I want to register each of my bank
accounts with its bank, currency, number, and cards so that statements import into the right
account and card alerts find their account.

An account is needed before anything can be imported. Its IBAN lets a statement row such as
`TEF A : 123456781` be recognized as a transfer to one of the user's own accounts (the local
number appears inside the IBAN), and its
cards route alert emails, which name a card and never an account.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant AS as AccountService
    participant Ref as Reference

    U->>UI: Accounts, New: "BAC colones", BAC, CRC, IBAN CR00010200000123456781, card 1111
    UI->>Web: createAccount(input)
    Web->>API: POST /api/accounts
    API->>API: Validate body (Zod): bank BAC or BN, currency CRC or USD,<br/>IBAN CR plus 20 digits, cards of 4 digits
    API->>AS: create(userId, input)
    AS->>Ref: Query ACCOUNT# (the user's accounts)
    alt A card already belongs to another account
        AS-->>UI: 400 card 1111 is already on "BAC dólares"
    else Valid
        AS->>Ref: Put ACCOUNT#id (version 1)
        AS-->>UI: 201 account
        UI-->>U: Account listed, available in the import account picker
    end
```

Editing an account (`PATCH /api/accounts/id`, with its version) follows the same checks, for
example to add a new card's last four digits.

---

### 01-S02 — Import a CSV statement

**Story:** As Patricia, I want to import a statement file I downloaded from my bank so that
I can use the product without giving it access to my account.

The browser uploads the file straight to S3 with a presigned POST, so the file never passes
through a Lambda. The bucket's CORS rule allows `POST` from the app's CloudFront domain and
from `http://localhost:3000`, and its event notification (prefix `imports/`, suffix `.csv`)
starts `ImportWorkerFn`, which runs the same `IngestPipeline` that emails use. The file is
matched to a bank template, checked against the chosen account, and then each row is saved
independently: a bad row is reported with its line number and reason while the rest import.

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
    participant Ref as Reference
    participant TS as TransactionService

    U->>UI: Pick account "BAC dólares" and the downloaded CSV
    UI->>UI: SHA-256 of the file (crypto.subtle), refuse over 1 MiB
    UI->>Web: startImport(accountId, fileName, sha256, size)
    Web->>API: POST /api/imports
    API->>Imp: createImport(userId, accountId, sha256, size)
    Imp->>Ref: Get ACCOUNT#id (must exist)
    Imp->>Ing: Put FILE#sha256 (importId, UPLOADING)<br/>if it does not exist or its status is FAILED
    alt File already imported or being imported
        Ing-->>Imp: ConditionalCheckFailed
        Imp-->>UI: 409 already imported, with that import's id
    else New file, or a retry of a failed one
        Imp->>Ing: Put IMPORT#id (UPLOADING, accountId)
        Imp->>S3: Presigned POST imports/userId/id.csv (1 byte to 1 MiB, 5 min)
        Imp-->>UI: importId + upload form
        UI->>S3: POST the file with the form fields
        S3-)W: ObjectCreated event
        W->>W: URL-decode the key into userId and importId
        W->>Ing: Update IMPORT#id (PROCESSING)
        W->>P: processCsv(userId, importId)
        P->>Ref: Get ACCOUNT#id and query every ACCOUNT# (the user's IBANs)
        P->>S3: Get the object's bytes
        P->>P: Decode as UTF-8, else Windows-1252, then split lines
        P->>T: detect(lines)
        P->>P: checkFile(template, account, preamble)
        alt Not a BAC or BN statement, other bank, other currency, or unexpected columns
            P->>Ing: Update IMPORT#id (FAILED, reason) and FILE#sha256 (FAILED)
        else File accepted
            loop Each data row (header, total, and summary lines are not data rows)
                P->>P: parseRow, validate (Zod), resolve kind, normalize, categorize, toUsd
                alt Row invalid
                    P->>P: Row error with line number and reason
                else Valid
                    P->>TS: save or merge(row, categorization, extra item ROWFP#hash)
                    Note right of TS: One TransactWriteItems: TXN, rollups,<br/>budget items, and the row claim
                    alt Row claim already exists
                        TS-->>P: AlreadyClaimedError, counted as skipped
                    else Saved, or merged with an email
                        TS-->>P: transaction
                    end
                end
            end
            P->>P: Compare out and in totals with the totals printed in the file
            P->>Ing: Update IMPORT#id (DONE, counts, row errors, checksum)<br/>and FILE#sha256 (DONE)
        end
        loop Every 2 s until DONE or FAILED
            UI->>Web: getImport(id)
            Web->>API: GET /api/imports/id
            API->>Imp: getImport(userId, id)
            Imp->>Ing: Get IMPORT#id
            API-->>UI: Status, counts, failure reason
        end
        UI-->>U: Summary: imported, transfers, merged, skipped,<br/>each unreadable row, and whether the totals match
    end
```

Re-running an import is safe: a row is claimed by its fingerprint in the same write that
saves its transaction, so rows that were saved are skipped and rows that failed (for
example because no exchange rate was available) import on the next try. Importing the BAC
sample into "BAC dólares" gives 65 rows, of which 58 are transfers between the holder's own
accounts, and totals that match the bank's (see
[Bank Formats](../bank-formats.md#5-import-checks-and-expected-results)).

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

Every 5 minutes the script sends new BAC and BN alert emails. An email is labelled as
processed only after a `2xx`, so a failed call is retried on the next run. The template
decides which DKIM domain must have signed the email, and the card's last four digits decide
the account.

```mermaid
sequenceDiagram
    autonumber
    participant GS as Gmail Apps Script
    participant API as ApiFn router
    participant CS as ConnectionService
    participant S3 as S3 raw-ingest
    participant P as IngestPipeline
    participant Ing as Ingestion
    participant T as TemplateRegistry
    participant DK as DkimVerifier
    participant EP as EmailTemplateParser
    participant Ref as Reference
    participant DM as DuplicateMatcher
    participant TS as TransactionService

    GS->>GS: Search from:(BAC and BN alert senders) -label:financeapp-processed
    loop Each email
        GS->>API: POST /ingest/gmail (Bearer token, raw MIME)
        API->>CS: authenticate(token)
        CS->>Ing: Get TOKEN#hash, update lastSeenAt
        API->>S3: Put raw/userId/messageId.eml
        API->>P: processEmail(userId, messageId, rawRef)
        P->>Ing: Put MSG#messageId (attribute_not_exists)
        alt Already processed
            P-->>GS: 200 duplicate
        else New
            P->>T: match(sender, subject)
            alt Sender not on the allowlist
                P->>Ing: Update MSG# (rejected)
                P-->>GS: 200 rejected
            else Allowed sender but no template for the subject
                P->>Ing: Update MSG# (unparsed, NO_TEMPLATE)
                P-->>GS: 200 unparsed
            else bac-notificacion or bn-voucher-digital
                P->>DK: verify(raw MIME, template.dkimDomain)
                alt No valid signature from that domain
                    P->>Ing: Update MSG# (rejected)
                    P-->>GS: 200 rejected
                else Verified
                    P->>EP: parse(mime, template)
                    Note right of EP: HTML to one line of text, then the<br/>field patterns in bank-formats.md section 6
                    P->>Ref: findAccountByCard(userId, cardLast4)
                    alt Field missing, unknown type, or card on no account
                        P->>Ing: Update MSG# (unparsed, reason), shown in the review inbox
                        P-->>GS: 200 unparsed
                    else Parsed and routed
                        P->>P: Normalize merchant, categorize, toUsd
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
        end
        GS->>GS: Add label financeapp-processed
    end
    GS->>API: POST /ingest/gmail/heartbeat
    Note over GS,API: A 5xx response leaves the email unlabelled,<br/>so it is sent again on the next run
```

The BAC sample becomes a ₡2,000.00 `purchase` at `FM ESC AVENIDA ESCAZU` on the account
holding card 1111; the BN sample becomes a ₡113.00 `purchase` at `TRANSPORTES JACO CENTRAL
CR` on the account holding card 2222.

### 01-S08c — Retry an email that was not understood

**Story (supporting 01-S08):** As Ezequiel, I want to retry an alert the product could not
read once I have fixed the cause so that I don't have to type that purchase by hand.

The usual cause is a card that is not on any account yet. The raw email is still stored in
S3, so after the card is added (01-S02a) the same email is processed again.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant RS as ReviewService
    participant Ing as Ingestion
    participant P as IngestPipeline

    U->>UI: Review inbox shows "Card ending 1111 isn't linked to an account"
    U->>UI: Add card 1111 to "BAC colones" (01-S02a), then Retry
    UI->>Web: retryMessage(messageId)
    Web->>API: POST /api/review/messages/messageId/retry
    API->>RS: retry(userId, messageId)
    RS->>Ing: Get MSG#messageId
    alt Status is not unparsed
        RS-->>UI: 409 nothing to retry
    else Unparsed
        RS->>Ing: Delete MSG#messageId
        RS->>P: processEmail(userId, messageId, rawRef)
        Note right of P: Same steps as 01-S08b from the MSG# claim on,<br/>reading the email already stored in S3
        P-->>RS: imported, unparsed with a new reason, or rejected
        RS-->>UI: 200 result
        UI-->>U: The row leaves the inbox, or shows its new reason
    end
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
