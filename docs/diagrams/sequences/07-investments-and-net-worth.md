# 07 Investments — Sequence Diagrams

Module 07 of the [context model](../context.md). Investments are recorded as four kinds of
investment transaction in `InvestmentTx`: deposit, withdrawal, buy, and sell. Each carries
the broker, the amount or gross trade value, the commission charged, and an optional name;
buys and sells also carry the ticker, its asset class, and the quantity. Holdings and broker
cash are rollups in `Aggregates`, written in the same `TransactWriteItems` as the investment
transaction:

- `HOLDING#<brokerId>#<ticker>` holds `assetClass`, `name`, `quantityMicro` (6 decimals),
  `costBasisCents`, `realizedGainCents`, and `version`.
- `CASH#<brokerId>` holds uninvested cash at the broker. It may go below zero when buys are
  recorded without the deposits that paid for them; the portfolio then shows a warning.
- `MONTH#<yyyy-mm>#INV` holds deposits, withdrawals, buys, sells, and commissions per month.

Cost basis uses the average-cost method. **Each broker has a fee schedule**: one fee for
deposits, one for withdrawals, and one per asset class (stocks and ETFs, or crypto) for buys
and for sells. Each fee is a flat amount plus a percentage. The schedule pre-fills the
commission when a transaction is recorded, the user can override it, and it estimates what
selling would cost. The shared `FeeCalculator` does the arithmetic in the browser and in the
API, so both always agree (see [class diagram section 10](../class-diagram.md#10-module-07-investments)).

Prices come from the Yahoo Finance chart API, which needs no key and covers stocks, ETFs,
mutual funds, crypto, and exchanges outside the US. Twelve Data is an optional fallback when
its key is configured. Prices are shared by all users as `PRICE#<ticker>` items: fresh for
15 minutes, then refreshed, and kept for 30 days so a last known price can still be shown,
marked stale with its age. Investment transactions never count toward spending or budgets.

All five stories are shown on one page, Portfolio. [07-S02a](#07-s02a--open-the-portfolio-overview)
fixes how they share it; the layout and wording are in
[class diagram section 2d](../class-diagram.md#portfolio-portfolio). Every price time the
user sees is the market time of the price, with its date (one rule, class diagram section
10b).

---

### 07-S01 — Record a holding

**Story:** As Ezequiel, I want to record what I hold by entering it myself so that I can
track my positions without connecting the product to my broker.

The ticker is looked up first, so the form can show the instrument's name and live price,
choose its asset class, and suggest the gross value and the commission. A buy adds units and
cost to the holding. Correcting an older trade changes the cost of later sales, so the
holding is rebuilt from its trades using the ticker index.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant VS as ValuationService
    participant PC as PriceClient
    participant IS as InvestmentService
    participant Ref as Reference
    participant DB as InvestmentTx + Aggregates
    participant Inv as InvestmentTx

    U->>UI: Portfolio, "Record a transaction" (InvestmentForm in a Dialog),<br/>Buy tab: broker Hapi, ticker VT
    UI->>Web: quote("VT")
    Web->>API: GET /api/portfolio/quote?ticker=VT
    API->>VS: quote("VT")
    VS->>PC: quote("VT")
    Note right of PC: Cached PRICE#VT if fresh, otherwise<br/>the provider, as in 07-S02
    alt Unknown ticker
        PC-->>UI: 404 "No instrument VTX on Yahoo Finance"
        UI-->>U: Ticker flagged, saving is still allowed
    else Found
        PC-->>UI: Vanguard Total World Stock ETF, ETF, $154.94 at 15:00
        UI->>UI: Asset class stocks and ETFs, gross = units x price,<br/>commission = Hapi buy fee for stocks and ETFs ($0.15 flat)
    end
    U->>UI: 0.6533 units, gross $101.22, commission left at $0.15, Save
    UI->>Web: recordInvestment({BUY, VT, SECURITY, quantityMicro 653300, grossCents 10122})
    Web->>API: POST /api/investments/transactions
    API->>IS: record(userId, buy)
    IS->>Ref: Get BROKER#brk-hapi (exists, fee schedule)
    IS->>IS: commissionCents omitted, so FeeCalculator.fee(fees.buy.security, 10122) = 15, source rule
    IS->>DB: TransactWriteItems
    Note right of DB: Put INV#date#id (BUY, assetClass SECURITY,<br/>quantityMicro 653300, grossCents 10122, commissionCents 15),<br/>ADD HOLDING quantity and cost (gross + commission),<br/>ADD CASH minus (gross + commission),<br/>ADD MONTH#...#INV boughtCents and commissionsCents
    IS-->>UI: 201 with the holding's new cost basis
    UI-->>U: Dialog closes, the Overview is refreshed, toast<br/>"VT: 0.6533 units, cost $101.37 including $0.15 in fees"
    U->>UI: Transactions tab, Edit on that row: units 0.6534
    UI->>Web: PATCH /api/investments/transactions/id
    Web->>API: PATCH /api/investments/transactions/id
    API->>IS: correct(userId, id, changes)
    IS->>Inv: Update INV item (version condition)
    IS->>Inv: Query ticker GSI (USER#id#VT), all trades in date order
    IS->>IS: Replay trades, recompute quantity, cost basis, realized gain
    IS->>DB: Put HOLDING#brk-hapi#VT (version condition)
    IS-->>UI: 200
    UI-->>U: Toast "Transaction corrected", the InvestmentTable row shows the new units
```

---

### 07-S02 — Value holdings at current prices

**Story:** As Ezequiel, I want to see my holdings valued at current market prices so that I
can stop looking at figures anchored to a stale quote.

Prices older than 15 minutes are refreshed when the portfolio opens. A quote in another
currency is converted to USD with Yahoo's own exchange rate for that currency. When a price
cannot be refreshed, the last known price is shown with its age; when there has never been
one, the holding says why.

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
    participant Prov as FallbackPriceProvider
    participant Y as Yahoo Finance chart API
    participant TD as Twelve Data API

    U->>UI: Open Portfolio
    UI->>Web: getValuation()
    Web->>API: GET /api/portfolio/valuation
    API->>VS: value(userId)
    VS->>Agg: Query USER#id begins_with HOLDING#
    VS->>PC: prices([VT, BTC-USD, SHOP.TO])
    PC->>Agg: BatchGet PRICE#VT, PRICE#BTC-USD, PRICE#SHOP.TO
    loop Each ticker whose retrievedAt is over 15 min old (at most 4 at a time)
        PC->>Prov: quote(ticker)
        Prov->>Y: GET /v8/finance/chart/SHOP.TO?range=1d&interval=1d<br/>User-Agent: Mozilla/5.0, timeout 4 s
        alt 200
            Y-->>Prov: meta.regularMarketPrice 208.12, regularMarketTime,<br/>currency CAD, instrumentType EQUITY, longName
        else 429, 5xx, or timeout, and a Twelve Data key is configured
            Prov->>TD: GET /price?symbol=...&apikey=... (US symbols and crypto only)
            TD-->>Prov: {"price": "..."} or {"status": "error", ...}
        end
        alt A provider answered
            Prov-->>PC: Quote (price, currency, time, type, name)
            opt Currency is not USD
                PC->>Prov: quote("USDCAD=X"), cached as PRICE#USDCAD=X
                PC->>PC: USD price = 208.12 / rate (GBp, ZAc, ILA divided by 100 first)
            end
            PC->>Agg: Put PRICE#SHOP.TO (priceMicros, native price and currency,<br/>fxRate, marketTime, retrievedAt, TTL 30 days)
        else Yahoo answered 404 Not Found
            Prov-->>PC: PriceError NOT_FOUND
            PC->>Agg: Update PRICE#ticker (lastError NOT_FOUND, lastAttemptAt)
        else Every provider failed
            Prov-->>PC: PriceError UNAVAILABLE
            PC->>Agg: Update PRICE#ticker (lastError UNAVAILABLE),<br/>the last known price stays
        end
    end
    PC-->>VS: Per ticker: priceMicros, marketTime, retrievedAt, fresh or stale, lastError
    VS->>VS: value = quantityMicro x priceMicros / 10^12 (BigInt, half-to-even to cents)
    VS->>VS: Per holding: gain = value - cost basis, gainBps, shareBps of the total.<br/>Totals over priced holdings: value, cost basis, gain, gainBps.<br/>priceTime = the oldest market time used
    VS->>Agg: Query USER#id begins_with CASH#
    VS-->>UI: Valuation: each holding (units, cost basis, price, priceTime, value, gain,<br/>share, stale age or reason), cash per broker, the totals, priceTime, unpriced tickers
    UI-->>U: HoldingsTable row "VT · Hapi · 0.6533 · $101.37 · $154.94, Nov 11, 3:00 PM ·<br/>$101.22 · ▼ −$0.15 (−0.1%)", a "from 3 h ago" badge on BTC-USD,<br/>"VTX is not a Yahoo Finance ticker" in place of its price
```

A `NOT_FOUND` ticker is asked again at most once an hour. The Twelve Data key, when it
exists, is read from SSM Parameter Store (`/FinanceApp/prices/twelvedata-api-key`) once per
Lambda container; without it only Yahoo is used.

---

### 07-S02a — Open the portfolio overview

**Story (supporting 07-S02, 07-S04, and 07-S05):** As Ezequiel, I want to open one page and
see what my investments are worth, what they cost me, and what would reach my bank so that
I can read my position without working through a form or a fee table first.

The Portfolio page shows several stories at once. This diagram fixes how they share the
screen: the four reads the server makes in parallel, the order of the sections, and what
the page shows before there is anything to value. Recording a transaction and editing
broker fees are not on this view; they open in a dialog (07-S01, 07-S04) or sit on their
own tab (07-S03).

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant BrS as BrokerService
    participant VS as ValuationService
    participant IS as InvestmentService
    participant Agg as Aggregates

    U->>UI: Open Portfolio (tab Overview)
    UI->>Web: Render /portfolio
    Note over UI: Skeleton in the shape of the page while it loads
    par Brokers
        Web->>API: GET /api/brokers
        API->>BrS: list(userId)
        BrS-->>Web: Broker[]
    and Valuation
        Web->>API: GET /api/portfolio/valuation
        API->>VS: value(userId), as in 07-S02
        VS-->>Web: Valuation
    and Selling estimate
        Web->>API: GET /api/portfolio/liquidation
        API->>VS: liquidation(userId), as in 07-S05
        VS-->>Web: Liquidation
    and Monthly flows
        Web->>API: GET /api/investments/flows?months=12
        API->>IS: monthlyFlows(userId, 12)
        IS->>Agg: BatchGet MONTH#yyyy-mm#INV for 12 months
        IS->>IS: A month with no item becomes all zeros
        IS-->>Web: 12 InvestmentMonthRollup (deposited, withdrawn, commissions, ...)
    end
    alt No brokers yet
        Web-->>UI: One EmptyState "Start with your broker": add a broker,<br/>record a deposit, record what you bought. Button "Add a broker"
    else Brokers but no investment transactions
        Web-->>UI: One EmptyState "No investments recorded yet",<br/>button "Record a transaction"
    else Holdings exist
        Web-->>UI: PortfolioOverview, in this order:<br/>PageHeader ("Prices as of Nov 11, 3:00 PM", Tabs, "Record a transaction"),<br/>warnings (negative cash, unpriced holdings),<br/>four StatTiles (Market value, Paid fees included, Gain or loss, If sold today),<br/>"What I hold" (SegmentedBar) beside "Value against what I paid" (BarList),<br/>HoldingsTable,<br/>"If I sold everything today" (LiquidationSection) beside<br/>"What I have put in" (ColumnChart)
        UI-->>U: "Market value $304.02", "Gain or loss ▲ +$3.87 (+1.3%)",<br/>"If sold today $251.87", all above the table
    end
```

Both price-dependent reads use the same cached `PRICE#` items, so the page refreshes each
price at most once. The header, the holdings table, and the selling estimate all show the
same `priceTime`. A chart with too little data is replaced by a sentence: "What I hold"
needs two priced holdings, and "What I have put in" needs three months with activity.

---

### 07-S03 — Describe a broker's fees

**Story:** As Ezequiel, I want to describe the fees my broker charges so that I can have
every figure account for them instead of correcting each one by hand.

Each broker has six fees, each a flat amount plus a percentage. Hapi, for example, charges
1.55% on deposits, $0.15 flat to buy or sell stocks and ETFs, 1% to buy or sell crypto, and a
flat charge to withdraw. Commissions already stored on past transactions are not changed
when the schedule is edited.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant BrS as BrokerService
    participant Ref as Reference

    U->>UI: Portfolio, "Brokers and fees" tab, "Edit fees" on Hapi<br/>(BrokerFeesForm in a Dialog): deposit 1.55%, withdrawal $25.00 flat,<br/>buy and sell stocks and ETFs $0.15, buy and sell crypto 1%
    alt New broker
        UI->>Web: createBroker("Hapi", fees)
        Web->>API: POST /api/brokers {name, fees}
        API->>API: Validate (Zod): every flatCents 0 or more, every percentBps 0 to 9999
        API->>BrS: create(userId, name, fees)
        BrS->>Ref: Put BROKER#id (version 1)
        BrS-->>UI: 201 broker
        UI-->>U: Dialog closes, toast "Broker added", its fee table is on the tab
    else Existing broker
        UI->>Web: updateBroker(brk-hapi, fees, version)
        Web->>API: PUT /api/brokers/brk-hapi {fees, version}
        API->>API: Validate (Zod), same rules
        API->>BrS: update(userId, brokerId, fees, version)
        BrS->>Ref: Update BROKER#brk-hapi (version condition)
        alt Edited elsewhere meanwhile
            BrS-->>UI: 409 reload and try again
        else Saved
            BrS-->>UI: 200 broker
            UI-->>U: Dialog closes, toast "Fees saved"
        end
    end
    Note over UI,Ref: Stored as fees: {deposit, withdrawal, buy: {security, crypto},<br/>sell: {security, crypto}}, each {flatCents, percentBps}. 1.55% = 155 bps
```

---

### 07-S04 — Record a contribution with commissions

**Story:** As Ezequiel, I want to record a contribution with the fees it actually incurred so
that I can know what a position has really cost me.

A contribution is a deposit to the broker followed by a buy. For each one the form suggests
the commission from the broker's fee schedule as the amounts are typed, explains it, and
lets the user change it. A deposit can be entered as the amount sent from the bank or as the
amount that arrived at the broker; the other is worked out by grossing up. The deposit fee
reduces the cash that reaches the broker and is not part of any holding's cost basis; the
buy fee is added to the cost basis of the holding it bought. Both fees are counted in the
month's `commissionsCents`.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant FC as FeeCalculator (shared)
    participant Web as Next.js server
    participant API as ApiFn router
    participant IS as InvestmentService
    participant Ref as Reference
    participant DB as InvestmentTx + Aggregates

    U->>UI: "Record a transaction" (InvestmentForm in a Dialog),<br/>Deposit tab, broker Hapi, "The amount I sent from my bank": $300.00
    UI->>FC: suggest(Hapi, DEPOSIT, none, 30000)
    FC-->>UI: commission 465, arrives 29535, "1.55% of $300.00 = $4.65"
    UI-->>U: Fee $4.65 pre-filled, with "Hapi deposit fee: 1.55% of $300.00 = $4.65"<br/>and "$295.35 arrives at Hapi" under it
    opt Only the amount that arrived is known
        U->>UI: Switch to "The amount that arrived at Hapi": $295.35
        UI->>FC: grossUp(fees.deposit, 29535)
        FC-->>UI: sent 30000, commission 465
    end
    opt The broker charged something else
        U->>UI: Change the commission, the suggestion stops overwriting it
    end
    UI->>Web: recordInvestment({DEPOSIT, amountCents 30000}),<br/>commissionCents sent only if the user changed it
    Web->>API: POST /api/investments/transactions
    API->>IS: record(userId, deposit)
    IS->>Ref: Get BROKER#brk-hapi (fee schedule)
    alt commissionCents omitted
        IS->>FC: fee(fees.deposit, 30000) = 465, commissionSource rule
    else commissionCents given
        IS->>IS: commissionSource manual
    end
    IS->>DB: TransactWriteItems
    Note right of DB: Put DEPOSIT (amountCents 30000, commissionCents 465),<br/>ADD CASH#brk-hapi 29535,<br/>ADD MONTH#...#INV depositedCents and commissionsCents
    IS-->>UI: 201
    UI-->>U: Dialog closes, toast<br/>"Deposit saved: $300.00 sent, $4.65 fee, $295.35 now in cash at Hapi"
    U->>UI: "Record a transaction" again, Buy tab: ticker BTC-USD,<br/>quote "Bitcoin USD", crypto, gross $200.00
    UI->>FC: suggest(Hapi, BUY, CRYPTO, 20000)
    FC-->>UI: commission 200, "1% of $200.00 = $2.00"
    UI->>Web: recordInvestment({BUY, BTC-USD, CRYPTO, quantityMicro 2712, grossCents 20000})
    Web->>API: POST /api/investments/transactions
    API->>IS: record(userId, buy)
    IS->>FC: fee(fees.buy.crypto, 20000) = 200
    IS->>DB: TransactWriteItems
    Note right of DB: Put BUY, ADD HOLDING quantity and cost 20200,<br/>ADD CASH minus 20200, ADD MONTH#...#INV
    IS-->>UI: 201 with cost basis per unit
    UI-->>U: Dialog closes, toast<br/>"BTC-USD: 0.002712 units, cost $202.00 including $2.00 in fees"
```

Each save closes the dialog and reports what was saved in a toast for that type, so a
deposit never shows a buy's cost line. The Overview is refreshed after every save, and
both fees appear in the caption of "What I have put in".

---

### 07-S05 — Value if sold today

**Story:** As Ezequiel, I want to see what I would actually receive if I sold everything
today so that I can know what my investments are worth to me rather than on paper.

Selling costs each holding its broker's sell fee for its asset class, and bringing the money
home costs the broker's withdrawal fee, charged once on everything withdrawn from that
broker. Every deduction is listed with the rule that produced it.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant VS as ValuationService
    participant FC as FeeCalculator (shared)
    participant Ref as Reference
    participant Agg as Aggregates

    U->>UI: Portfolio, Overview: the "If sold today" tile and the<br/>"If I sold everything today" section
    UI->>Web: getLiquidation()
    Web->>API: GET /api/portfolio/liquidation
    API->>VS: liquidation(userId)
    VS->>VS: value(userId), as in 07-S02
    VS->>Ref: Query BROKER# (fee schedules)
    VS->>Agg: Query CASH# per broker
    loop Each broker
        loop Each priced holding at that broker
            VS->>FC: fee(fees.sell[assetClass], marketValue)
            VS->>VS: net = marketValue - sellFee, gain = net - costBasis
        end
        VS->>VS: proceeds = sum of net + cash
        VS->>FC: fee(fees.withdrawal, proceeds), only when proceeds are above 0
        VS->>VS: netToBank = proceeds - withdrawalFee, negativeCash = cash below 0
    end
    VS->>VS: Per broker: gross = sum of market value + cash, sellFees = sum of sell fees.<br/>total = sum of netToBank, priceTime = the oldest market time used
    VS-->>UI: Liquidation: per broker, holdings (market value, sell fee and its rule, net, gain),<br/>cash, gross, sell fees, withdrawal fee and its rule, net to bank.<br/>Also the total, priceTime, and unpriced tickers
    UI-->>U: LiquidationSection: "You would receive $4,812.06", "Prices as of Nov 11, 3:00 PM.<br/>Before taxes. An estimate, not a recommendation." Per broker a SegmentedBar<br/>(To your bank, Selling fees, Withdrawal fee), every deduction itemised under<br/>"How this is calculated", and a warning when a broker's cash is negative
```
