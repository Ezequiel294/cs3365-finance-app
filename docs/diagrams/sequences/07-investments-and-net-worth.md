# 07 Investments — Sequence Diagrams

Module 07 of the [context model](../context.md). Investments are recorded as four kinds of
investment transaction in `InvestmentTx`: deposit, withdrawal, buy, and sell. Each carries
the broker, the amount or gross trade value, the commission actually charged, and an
optional name; buys and sells also carry the ticker and quantity. Holdings and broker cash
are rollups in `Aggregates`, written in the same `TransactWriteItems` as the investment
transaction:

- `HOLDING#<brokerId>#<ticker>` holds `quantityMicro` (6 decimals), `costBasisCents`,
  `realizedGainCents`, and `version`.
- `CASH#<brokerId>` holds uninvested cash at the broker.
- `MONTH#<yyyy-mm>#INV` holds deposits, withdrawals, buys, sells, and commissions per month.

Cost basis uses the average-cost method. Each broker has one commission rule
(`flatCents`, `percentBps`) used to estimate the cost of selling. Prices come from a market
price API and are cached as `PRICE#<ticker>` items with a 15-minute TTL, shared by all
users. Investment transactions never count toward spending or budgets.

---

### 07-S01 — Record a holding

**Story:** As Ezequiel, I want to record what I hold by entering it myself so that I can
track my positions without connecting the product to my broker.

A buy adds units and cost to the holding. Correcting an older trade changes the cost of
later sales, so the holding is rebuilt from its trades using the ticker index.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant IS as InvestmentService
    participant Ref as Reference
    participant DB as InvestmentTx + Aggregates
    participant Inv as InvestmentTx

    U->>UI: Buy: VOO, 3.215 units, broker Schwab, $1,450.00, commission $0.15
    UI->>Web: POST /api/investments/transactions {type BUY}
    Web->>API: POST /api/investments/transactions
    API->>IS: record(userId, buy)
    IS->>Ref: Get BROKER#brk-schwab (exists for this user)
    IS->>DB: TransactWriteItems
    Note right of DB: Put INV#date#id (BUY, quantityMicro 3215000,<br/>grossCents 145000, commissionCents 15),<br/>ADD HOLDING quantity and cost (gross + commission),<br/>ADD CASH minus (gross + commission),<br/>ADD MONTH#...#INV boughtCents and commissionsCents
    IS-->>UI: 201
    U->>UI: Correct the units to 3.2155
    UI->>Web: PATCH /api/investments/transactions/id
    Web->>API: PATCH /api/investments/transactions/id
    API->>IS: correct(userId, id, changes)
    IS->>Inv: Update INV item (version condition)
    IS->>Inv: Query ticker GSI (USER#id#VOO), all trades in date order
    IS->>IS: Replay trades, recompute quantity, cost basis, realized gain
    IS->>DB: Put HOLDING#brk-schwab#VOO (version condition)
    IS-->>UI: 200
```

---

### 07-S02 — Value holdings at current prices

**Story:** As Ezequiel, I want to see my holdings valued at current market prices so that I
can stop looking at figures anchored to a stale quote.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant VS as ValuationService
    participant Agg as Aggregates
    participant PC as PriceClient
    participant SSM as SSM Parameter Store
    participant Feed as Market price API

    U->>UI: Open Portfolio
    UI->>Web: GET /api/portfolio/valuation
    Web->>API: GET /api/portfolio/valuation
    API->>VS: value(userId)
    VS->>Agg: Query USER#id begins_with HOLDING#
    VS->>PC: prices(tickers)
    PC->>Agg: BatchGet PRICE#VOO, PRICE#BTC
    alt Price cached and under 15 min old
        Agg-->>PC: price, retrievedAt
    else Missing or expired
        opt First call in this Lambda container
            PC->>SSM: GetParameter price API key (decrypted)
        end
        PC->>Feed: Quote request
        alt API answers
            Feed-->>PC: price
            PC->>Agg: Put PRICE#ticker (price, retrievedAt, TTL 15 min)
        else API down or rate limited
            PC->>PC: Use last known price, stale true
        end
    end
    PC-->>VS: price, retrievedAt, stale per ticker
    VS->>VS: value = quantity x price per holding
    VS-->>UI: Each holding: units, cost basis, price, price time, value, stale flag
    UI-->>U: "VOO $1,612.40 (price 10:42)", stale prices marked with their age
```

---

### 07-S03 — Describe a broker's commission

**Story:** As Ezequiel, I want to describe the fees my broker charges so that I can have
every figure account for them instead of correcting each one by hand.

The commission rule is used to estimate what selling would cost (07-S05). Commissions
already stored on past transactions are not changed when the rule is edited.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant BrS as BrokerService
    participant Ref as Reference

    U->>UI: Edit Schwab: commission $0.15 flat plus 0%
    UI->>Web: PUT /api/brokers/brk-schwab {flatCents 15, percentBps 0, version}
    Web->>API: PUT /api/brokers/brk-schwab
    API->>BrS: update(userId, brokerId, rule, version)
    BrS->>BrS: Validate: flat fee in cents, percentage in basis points, both 0 or more
    BrS->>Ref: Update BROKER#brk-schwab (version condition)
    BrS-->>UI: 200 broker
```

---

### 07-S04 — Record a contribution with commissions

**Story:** As Ezequiel, I want to record a contribution with the fees it actually incurred so
that I can know what a position has really cost me.

A contribution is a deposit to the broker followed by a buy. Each records the commission
actually charged, and both commissions become part of the holding's cost basis.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant IS as InvestmentService
    participant DB as InvestmentTx + Aggregates

    U->>UI: Deposit $203.15 to Schwab, commission $3.15
    UI->>Web: POST /api/investments/transactions {type DEPOSIT}
    Web->>API: POST /api/investments/transactions
    API->>IS: record(userId, deposit)
    IS->>DB: TransactWriteItems
    Note right of DB: Put DEPOSIT (amountCents 20315, commissionCents 315),<br/>ADD CASH#brk-schwab 20000,<br/>ADD MONTH#...#INV depositedCents and commissionsCents
    IS-->>UI: 201
    U->>UI: Buy 0.389 VOO for $199.75, commission $0.15
    UI->>Web: POST /api/investments/transactions {type BUY}
    Web->>API: POST /api/investments/transactions
    API->>IS: record(userId, buy)
    IS->>DB: TransactWriteItems
    Note right of DB: Put BUY, ADD HOLDING quantity and cost 19990,<br/>ADD CASH minus 19990, ADD MONTH#...#INV
    IS-->>UI: 201 with cost basis per unit
    UI-->>U: "VOO cost basis now $1,649.90 including $3.45 in commissions"
```

---

### 07-S05 — Value if sold today

**Story:** As Ezequiel, I want to see what I would actually receive if I sold everything
today so that I can know what my investments are worth to me rather than on paper.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant VS as ValuationService
    participant Ref as Reference
    participant Agg as Aggregates

    U->>UI: Open "If I sold everything today"
    UI->>Web: GET /api/portfolio/liquidation
    Web->>API: GET /api/portfolio/liquidation
    API->>VS: liquidation(userId)
    VS->>VS: value(userId), as in 07-S02
    VS->>Ref: Query BROKER# commission rules
    loop Each holding
        VS->>VS: sellCommission = flatCents + marketValue x percentBps
        VS->>VS: netIfSold = marketValue - sellCommission
        VS->>VS: unrealizedGain = netIfSold - costBasis
    end
    VS->>Agg: Query CASH# per broker
    VS->>VS: total = sum(netIfSold) + sum(cash)
    VS-->>UI: Per holding market value, sell commission, net, gain, plus cash, total, price time
    UI-->>U: "You would receive $4,812.06 (prices from 10:42), before taxes"
```
