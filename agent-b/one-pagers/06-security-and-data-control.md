# Security and Data Control — 1-Pager

### PROBLEM

Patricia has already decided. She read about applications that ask for the username and
password to her bank and hold them in order to fetch her transactions, and she is not
going to do that — not because she misunderstands the technology, but because she
understands it well enough to know that standing access to her account is exactly what
she would be handing over. She is not looking to be reassured, and a product that tries
to talk her out of the position will lose her at that screen. She is entirely willing to
download her own statements and hand over a file, which gives the product everything it
needs and gives away nothing she is not prepared to give.

The failure this guards against is a product that treats linking an account as the real
path and everything else as a degraded one — where the unlinked experience is a stub, the
interface nags, and half the views say they need a connection. For Patricia that is not a
lesser version of the product; it is a product she cannot use. For Ezequiel the same
requirement arrives from a different direction: he carries this on a phone that goes
everywhere with him, and a phone that can be picked up and opened reveals every account
he holds, what he earns, and where he shops. Both of them want the same underlying thing,
which is to decide what the product may see and to be able to change their mind later
without argument, negotiation, or a support request.

### ASSUMPTIONS

- **Assumed.** Every capability in the product except those explicitly requiring a
  connection works fully from imported and manually entered data. This is a design
  constraint on all other initiatives, not a feature of this one.
- **Assumed.** Where a connection exists at all, it issues a revocable token. The product
  never holds an institution password, and no story anywhere depends on it doing so.
- **Unverified.** Which jurisdictions' personal data obligations apply to the product's
  users. Costa Rica has a personal data protection statute with a supervisory authority,
  and further obligations may follow from where data is stored. Settled by identifying the
  applicable statutes and hosting locations, and recording them here with citations.
- **Assumed.** Device-level biometric or passcode authentication is available on the
  platforms targeted and is the appropriate lock, rather than the product inventing its own.
- **Assumed.** Export must be in a format usable elsewhere without the product, since an
  export that only this product can read is not a way out.
- **Assumed.** Deletion means deletion. Retaining data after a deletion request for
  analytics or recovery is out of scope and is not done.

### FUNCTIONAL REQUIREMENTS

* **06-S01** — **As** Patricia, **I want to** use every part of the product without linking
  any account **so that I can** keep my banking credentials to myself and still get the
  whole benefit
  * No view, total, or budget is unavailable or degraded solely because no account is
    connected
  * The product does not prompt her to connect an account after she has declined once
  * Any capability that genuinely requires a connection states so plainly at the point of
    use, rather than appearing broken

* **06-S02** — **As** Patricia, **I want to** see exactly what the product can currently
  access and withdraw any of it immediately **so that I can** decide what it may see and
  change my mind whenever I want
  * One screen lists every connection, import source, and shared budget, and what each
    exposes
  * Revoking takes effect immediately, without a support request or a waiting period
  * Revoking states plainly what will stop working and what data is removed

* **06-S03** — **As** Ezequiel, **I want to** require my device's own lock before the
  product opens **so that I can** hand someone my phone without handing them my finances
  * Uses the device's existing biometric or passcode mechanism rather than a separate
    password
  * Locks again after a period of inactivity that he sets
  * Locking is enforced on the web as well, by ending an idle session

* **06-S04** — **As** Patricia, **I want to** take all my data out in a format I can open
  elsewhere **so that I can** leave whenever I choose without losing what I have recorded
  * Export covers transactions, categories, groups, budgets, and holdings
  * The format opens in a spreadsheet application with no conversion step
  * Export completes without needing to contact anyone

* **06-S05** — **As** Patricia, **I want to** delete my data and know it is gone **so that
  I can** end my relationship with the product completely
  * Deletion covers everything held about her, including anything derived from her data
  * She is told what will be deleted before confirming, and how long it takes
  * Completion is confirmed to her rather than assumed

* **06-S06** — **As** Daniela, **I want to** get back into my account if I lose my phone
  **so that I can** recover without losing everything I have recorded
  * Recovery does not depend on the lost device
  * Recovery does not require exposing her data to anyone
  * A recovered session requires the lock in 06-S03 to be re-established before use

### NON-FUNCTIONAL REQUIREMENTS

- **Credential storage.** No institution password is ever stored, transmitted, or logged
  by the product, under any configuration.
- **Token custody.** Connection tokens are held server-side only, never written into the
  application bundle or device storage, and are revocable independently per connection.
- **Encryption at rest.** All personal financial data is encrypted at rest with AES-256 or
  equivalent. Device-local caches use the platform's own protected storage.
- **Encryption in transit.** TLS 1.3 or later for all traffic. Certificate validation
  failures terminate the connection rather than prompting the user to continue.
- **Authentication.** Device biometric or passcode for the application; idle sessions end
  after a user-set period defaulting to 15 minutes.
- **Revocation latency.** A revocation takes effect within 5 seconds and is irreversible
  without the user re-granting access.
- **Deletion service level.** A deletion request completes within 30 days, including
  backups, and the user is notified on completion. No derived or aggregated copy of the
  deleted data is retained.
- **Data minimisation.** Only data required by a capability the user has enabled is
  collected. Transaction data is never transmitted to any third party for advertising,
  analytics, or resale, under any circumstance.
- **Logging.** Application logs never contain account numbers, balances, transaction
  amounts, or merchant names.
- **Breach notification.** Affected users are notified within 72 hours of confirming a
  breach involving personal financial data.

### REQUIREMENTS SIZING

Story points on the modified Fibonacci scale, against the baseline anchor **01-S03 = 2
points** (see `../sizing.md`).

| Story | Size | Rationale |
|---|---|---|
| 06-S01 | 3 | Above the anchor, and small only because it is enforced continuously rather than built once. It is a constraint every other initiative must satisfy; the work here is the audit that proves nothing degrades without a connection, plus suppressing the prompt. Sized as the verification effort, not as new machinery. |
| 06-S02 | 8 | Four times the anchor. Enumerating every access path in one place requires every subsystem to declare what it holds, and revocation must reach all of them and hold under partial failure. Complexity and breadth both high; unknowns moderate, since each subsystem revokes differently. |
| 06-S03 | 3 | Modestly above the anchor. Platform biometric APIs are well documented and conventional; the increments are an idle timer and an equivalent session expiry on the web, which is a different mechanism for the same rule. |
| 06-S04 | 5 | Two and a half times the anchor. Traversing every entity type into one portable format, with correct handling of currency and dates, over a volume that may not fit in memory. No new technology; complexity in completeness and in not corrupting the output. |
| 06-S05 | 8 | Four times the anchor, and larger than it looks. Deletion must reach backups, derived aggregates, and anything held by a connected service, and must be provable rather than asserted. Unknowns are real: every store added later must be covered, so this creates an ongoing obligation. |
| 06-S06 | 5 | Two and a half times the anchor. Recovery is standard in shape but unforgiving in detail — it must not become the weakest way into the account, which makes the security review the substantial part rather than the implementation. |
