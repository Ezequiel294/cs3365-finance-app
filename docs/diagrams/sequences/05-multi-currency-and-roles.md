# 05 Multi-Currency — Sequence Diagrams

Module 05 of the [context model](../context.md). The base currency is USD. Every
transaction keeps its original `currency` and `amountMinor`, which are never changed, and
also stores `amountUsdCents`, `fxRate`, and `fxDate`. CRC is converted at the BCCR rate of
the transaction date. Rollups and budgets use the USD amount.

`FxService` reads the BCCR endpoint, indicator code, and token from SSM Parameter Store
(`/FinanceApp/bccr/*`) once per Lambda container, and caches each day's rate as an
`FX#USD-CRC#<date>` item in `Aggregates`, so BCCR is called at most once per date.

---

### 05-S01 — Show the original currency

**Story:** As Ezequiel, I want to see every amount in the currency it actually occurred in
so that I can check any figure against my bank statement.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant TQ as TransactionQueryService
    participant Tx as Transactions

    U->>UI: Open transactions for October
    UI->>Web: Render /transactions?month=2026-10
    Web->>API: GET /api/transactions?from=2026-10-01&to=2026-10-31
    API->>TQ: list(userId, range)
    TQ->>Tx: Query SK between TXN#2026-10-01 and TXN#2026-10-31~
    TQ-->>Web: Each with currency, amountMinor, amountUsdCents, fxRate, fxDate
    Web-->>UI: Rows show the original amount first, USD and the rate next to it
    UI-->>U: "₡14,000 ($27.40 at 510.95 on Oct 14)" and "$12.00" in the same list
```

---

### 05-S02 — Convert at the BCCR rate

**Story:** As Ezequiel, I want to see which rate produced my totals so that I can trust a
combined figure enough to use it.

Every converted amount is produced here, and the rate and its date are stored on the
transaction so they can be shown next to it (05-S01).

```mermaid
sequenceDiagram
    autonumber
    participant TS as TransactionService
    participant Fx as FxService
    participant Agg as Aggregates
    participant SSM as SSM Parameter Store
    participant RP as BccrRateProvider
    participant BCCR as BCCR API

    TS->>Fx: toUsd(1400000 minor, CRC, 2026-10-14)
    alt Currency is USD
        Fx-->>TS: same amount, rate 1.0
    else Currency is CRC
        Fx->>Agg: Get FX#USD-CRC#2026-10-14
        alt Rate cached
            Agg-->>Fx: rate, rateDate, source BCCR
        else Not cached
            opt First call in this Lambda container
                Fx->>SSM: GetParameters /FinanceApp/bccr/* (token decrypted)
            end
            Fx->>RP: rateFor(2026-10-14)
            RP->>BCCR: GET endpoint, indicator, date, token
            alt BCCR has a rate for that date
                BCCR-->>RP: 510.95
            else No rate that day (weekend or holiday)
                RP->>BCCR: Request the 7 days before
                BCCR-->>RP: Latest earlier rate and its date
            end
            Fx->>Agg: Put FX#USD-CRC#2026-10-14 (rate, rateDate, source)
        end
        Fx->>Fx: usd = round_half_even(amount / rate, 2 decimals)
        Fx-->>TS: amountUsdCents, fxRate, fxDate
    end
    alt BCCR unreachable and nothing cached
        Fx-->>TS: FxUnavailableError
        Note over TS,Fx: The save is refused with 503 and can be retried.<br/>Nothing is saved with a guessed rate.
    end
```

---

### 05-S06 — Import a statement in its own currency

**Story:** As Patricia, I want to import a statement in a currency and have it stay in that
currency so that I can reconcile what I imported against the document I downloaded.

This is the currency step of the CSV pipeline in 01-S02. Each row keeps its own currency.

```mermaid
sequenceDiagram
    autonumber
    participant P as IngestPipeline
    participant T as TemplateRegistry
    participant Ref as Reference
    participant Fx as FxService
    participant TS as TransactionService

    P->>T: template for this file
    T-->>P: currency from a column (e.g. "Moneda"), or from the account
    alt Template takes currency from the account
        P->>Ref: Get ACCOUNT#id currency
    end
    loop Each row
        P->>P: currency = row column, or account currency
        alt Currency missing or not CRC or USD
            P->>P: Record row error "unknown currency"
        else
            P->>Fx: toUsd(amountMinor, currency, rowDate)
            Fx-->>P: amountUsdCents, rate, date
            P->>TS: save(currency, amountMinor unchanged, plus USD fields)
        end
    end
    Note over P,TS: A file mixing CRC and USD rows imports row by row.<br/>The original amount is stored exactly as it appears in the file.
```
