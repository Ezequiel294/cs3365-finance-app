# Accounts and Transaction Ingestion — 1-Pager

### PROBLEM

Ezequiel holds money at two banks and spends from a third account he tops up by hand, and
none of those institutions will hand a personal application a list of what he spent. So
every few weeks he sits down with his statements and types his own transactions into a
spreadsheet, which is the single reason his records are accurate for about a week after
he updates them and wrong for the three weeks that follow. He has tried a consumer
tracker that promised to do this for him; it captured some transactions, missed others,
and gave him no way to tell which was which, so he stopped trusting it and went back to
typing. Patricia has the same underlying problem from the opposite direction: her bank
does publish her statements, she downloads them every month, and she has decided she will
not give any application her banking password to get at them any faster.

What neither of them has is a way to get transactions into one place that matches what
their banks are actually willing to give. A product that only works when a bank exposes a
data connection is useless to Patricia by her own choice and useless to Ezequiel by his
bank's, and a product that only accepts hand-typed entry is the spreadsheet again with a
worse editor. What is missing is a single place where transactions arrive by whatever
route is available for that account — a connection where one exists, a downloaded
statement file where it does not, and a few seconds of typing for the coffee nobody will
ever see a record of — with the product keeping them straight when the same purchase
turns up twice by two different routes.

### ASSUMPTIONS

- **Verified (2026-09-20).** BAC Credomatic operates a developer portal at
  `developers.baccredomatic.com` with self-serve application registration, API keys, and
  rate-limited plans. Its published API offering is framed as corporate treasury
  integration for companies (`baccredomatic.com/empresas/api-tesoreria-corporativa-digital`),
  reached by consultation request and technical evaluation, and described as serving
  organisations with IT teams. The product catalogue does not render without signing in,
  though its filter categories include *Accounts* and *Statements*.
- **Unverified.** Whether any institution offers a consent flow that lets a third-party
  application read an *individual's* personal accounts on their behalf, as opposed to a
  company reading its own. Settled by registering on the portal, reading the catalogue
  and terms behind the login, and recording the answer. Until then no story here depends
  on a bank connection existing.
- **Verified (2026-09-20).** Aggregator coverage does not currently reach Costa Rican
  institutions. Belvo publishes coverage for Mexico, Brazil, and Colombia; Plaid's
  coverage is US, Canada, UK, and EU; the Open Banking Tracker directory lists Costa Rican
  banks with no confirmed developer-portal data.
- **Unverified.** That transaction alert emails or messages, forwarded by the account
  holder to an address the product controls, can be parsed reliably enough to create
  transactions. Settled by collecting a month of real alerts from one institution and
  measuring how many parse correctly.
- **Assumed.** Statement exports are available to the account holder in a delimited or
  structured file format, and their column layout is stable within one institution but
  differs between institutions.
- **Assumed.** The same purchase can legitimately reach the product twice — once from a
  connection or alert and once from a statement covering the same period — so duplicate
  detection is a normal condition rather than an error.

### FUNCTIONAL REQUIREMENTS

* **01-S01** — **As** Ezequiel, **I want to** connect an account at my bank **so that I
  can** have transactions appear without typing them in myself
  * The product states plainly which institutions can be connected and which cannot,
    rather than failing at the end of the attempt
  * A connection that cannot be offered for an institution says so before any credential
    or consent is requested
  * An account whose connection later stops working is shown as stale, with the date of
    the last transaction received

  > **Split.** Sized at 13 and therefore too large to estimate reliably. Replaced for
  > implementation by **01-S07**, **01-S08**, and **01-S09** below. Retained here because it states the need those
  > stories exist to serve.

* **01-S02** — **As** Patricia, **I want to** import a statement file I downloaded from my
  bank **so that I can** use the product without giving it access to my account
  * The importer accepts a delimited file and lets her map its columns to amount, date,
    description, and currency the first time she uses a given layout
  * A saved mapping is reused automatically on the next import from the same institution
  * Rows that cannot be read are reported individually with the reason, and the rest of
    the file still imports

* **01-S03** — **As** Daniela, **I want to** add a transaction by hand in a few seconds
  **so that I can** record a cash payment before I forget it
  * Amount and date are the only entries required; everything else may be left for later
  * The date defaults to today and the currency to the account's own currency
  * The entry can be completed without leaving the screen she started from

* **01-S04** — **As** Ezequiel, **I want to** be shown transactions that look like
  duplicates of each other **so that I can** keep one record per purchase when the same
  charge arrives by two routes
  * Candidates are proposed on matching amount, currency, and a date within a short window
  * Nothing is merged without him confirming it
  * A pair he declines to merge is not proposed again

* **01-S05** — **As** Andrés, **I want to** record a payment that has arrived from a client
  **so that I can** have money coming in counted as well as money going out
  * Incoming amounts are recorded against an account and are distinguishable from spending
  * A payment can be recorded in the currency it arrived in
  * The date recorded is the date the money became available, which may differ from the
    invoice date

* **01-S06** — **As** Ezequiel, **I want to** see every account I hold and its current
  balance in one list **so that I can** know where my money is without opening three
  banking applications
  * Each account shows its balance in its own currency
  * Accounts from different institutions appear in one list
  * The list shows when each account's information was last updated

* **01-S07** — **As** Ezequiel, **I want to** see which of my institutions can be connected
  and which cannot **so that I can** find out where I stand before attempting anything
  * Each institution is listed as connectable, import-only, or manual-only
  * The listing states what a connection would provide where one exists
  * An institution with no connection available says so plainly rather than failing later

* **01-S08** — **As** Ezequiel, **I want to** authorise a connection to an institution that
  supports one **so that I can** have its transactions arrive without my typing them
  * Authorisation happens through the institution, and the product never sees a password
  * Access granted is revocable from within the product at any time
  * A failed or declined authorisation leaves the account fully usable by import and by
    manual entry

* **01-S09** — **As** Ezequiel, **I want to** be told when a connection has stopped working
  **so that I can** notice before I rely on figures that quietly stopped updating
  * A stale connection is marked with the date of the last transaction received
  * Totals derived from a stale account state their age
  * Re-authorising is reachable from the notice itself

### NON-FUNCTIONAL REQUIREMENTS

- **Credential handling.** The product never stores a bank password. Where a connection
  exists it holds a revocable token issued by the institution; any such token is held
  server-side and never written into the application bundle or device storage.
- **Transport.** All traffic between the application and any service uses TLS 1.3 or
  later. Connections presenting an invalid certificate are refused rather than warned on.
- **Import performance.** A statement file of up to 5,000 rows completes import, including
  duplicate detection, within 10 seconds on a current mid-range phone.
- **Manual entry latency.** Saving a hand-entered transaction returns control to the user
  within 300 ms, and does not wait on any network call to succeed.
- **Offline behaviour.** Manual entry and viewing of already-captured transactions work
  with no network connection; entries made offline synchronise when connectivity returns.
- **Freshness.** Where a connection exists, transactions are no more than 12 hours behind
  the institution, and the interface states the time of the last successful update rather
  than implying it is live.
- **Import durability.** A failed or interrupted import leaves no partial set of
  transactions; either the readable rows are all committed or none are.

### REQUIREMENTS SIZING

Estimated in story points on the modified Fibonacci scale, by comparison against the
published baseline anchor **01-S03 = 2 points** (see `../sizing.md`). Each estimate is
scored on size, complexity, technology, and unknowns.

| Story | Size | Rationale |
|---|---|---|
| 01-S01 | — (split) | Sized at 13: unknowns dominated, since no institution is confirmed to offer third-party personal-account access, and the story hid discovery, consent, token storage, refresh, and failure handling behind one sentence. Exceeded the splitting threshold, so it carries no estimate and is replaced by 01-S07, 01-S08, and 01-S09. |
| 01-S07 | 3 | Modestly above the anchor. A listing driven by a table of which institutions support what; the work is establishing and maintaining that table honestly rather than building the view. No technology risk. |
| 01-S08 | 8 | Four times the anchor, and the piece that inherits the parent's risk. Consent flow, token exchange, storage, and refresh are all new technology, and whether any institution offers this route to an individual at all remains unverified. Sized provisionally and re-estimated when the portal investigation returns; it may prove not to be buildable. |
| 01-S09 | 3 | Above the anchor. Detecting staleness is a timestamp comparison; the work is propagating an age indicator into every total that depends on the account, which is breadth rather than difficulty. |
| 01-S02 | 8 | Larger than the anchor on every dimension. Size covers file parsing, an interactive column mapping step, and mapping reuse; complexity comes from per-row error reporting that must not abort the import; unknowns are moderate, since real files vary more than documentation suggests. |
| 01-S03 | **2** | **Baseline anchor.** One form, three fields, a local write, and sensible defaults. No new technology, no external dependency, and nothing unknown about it. Every other estimate in the product is expressed relative to this. |
| 01-S04 | 5 | Roughly twice the anchor. Small in surface — a comparison and a confirmation prompt — but the matching rule needs deliberate design to avoid proposing false pairs, and declining a pair must be remembered, which is state the anchor does not have. |
| 01-S05 | 3 | Slightly above the anchor. Structurally the same entry form with a direction and an availability date, reusing 01-S03's mechanics; the increment is the distinction between incoming and outgoing amounts flowing through later totals. |
| 01-S06 | 3 | Above the anchor for aggregation rather than difficulty: reading several accounts, displaying each in its own currency without converting, and surfacing per-account freshness. No new technology and no meaningful unknowns. |
