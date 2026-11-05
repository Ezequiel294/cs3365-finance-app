# Class Diagram

## What this diagram shows

This is the class model needed to implement every in-scope
[sequence diagram](sequences/README.md). Every participant in a sequence diagram is a class
here, and every message is a method. The model is split into one diagram per layer or
module so each stays readable:

| Section | Contents |
|---|---|
| [1. Domain model](#1-domain-model) | Entities, value objects, enums, and how they relate |
| [2. Next.js layer](#2-nextjs-layer) | Pages, Server Actions (UI controllers), session handling, the typed API client |
| [3. API shell and data access](#3-api-shell-and-data-access) | Lambda entry points, routers, errors, configuration, repositories |
| [4. Transactions core](#4-transactions-core) | The single save path every source uses, and the rollup planner |
| [5. Module 01: Accounts and Ingestion](#5-module-01-accounts-and-ingestion) | CSV import, Gmail connection and ingest, parsing, duplicates, review |
| [6. Module 02: Categorization and Rules](#6-module-02-categorization-and-rules) | Normalizer, categorizer, rules |
| [7. Module 03: Budgets](#7-module-03-budgets) | Budgets, matching, periods, progress |
| [8. Module 04: Dashboard](#8-module-04-dashboard) | Spending analytics |
| [9. Module 05: Multi-Currency](#9-module-05-multi-currency) | FX service and the BCCR rate provider |
| [10. Module 07: Investments](#10-module-07-investments) | Investment transactions, holdings, brokers, valuation, prices |
| [11. Gmail Apps Script](#11-gmail-apps-script) | The script that runs in the user's Google account |

Module 06 (Security and Data Control) has no classes of its own in this iteration. Its one
in-scope story, revoking the Gmail connection (06-S02), is handled by `ConnectionService` in
module 01.

## Why this diagram is valuable to the design

- **It is the build list.** A code generator can create one file per class and one function
  per method, and the sequence diagrams say in which order those methods are called.
- **It fixes the boundaries.** Routers only parse and validate, services hold the business
  rules, and repositories are the only classes that touch DynamoDB, S3, or SSM. Each rule
  of the design has exactly one class that owns it.
- **It makes reuse explicit.** All three ingestion routes end in `TransactionService`, and all
  rollup arithmetic is in `RollupPlanner`, so spending totals and budgets cannot drift apart.

## Conventions

- **Money is integer minor units.** `amountMinor` is in the original currency. Fields ending
  in `Cents` are USD cents. Quantities are `quantityMicro` (millionths of a unit). No
  floating point is used for money.
- **Code layout.** `shared/` holds the Zod schemas and types used by both the Next.js app and
  the API. `api/src/` holds routers, services, repositories, `keys.ts`, and factories. Both
  Lambdas (`ApiFn`, `ImportWorkerFn`) are built from the same `api/` bundle.
- **Dependency injection.** `ServiceFactory` builds each client, repository, and service once
  per Lambda container and passes dependencies through constructors. Services depend on
  interfaces where an external system is involved (`FxRateProvider`, `MarketPriceProvider`,
  `Clock`), so tests can pass fakes.
- **Arrows.** `-->` is "uses", `..|>` is "implements", `--|>` is "extends", `*--` is
  "contains", and multiplicities are written on the line. `$` marks a static method.

---
## 1. Domain model

These are the records stored in DynamoDB and passed between layers. Key formats are listed
in the [sequence diagram conventions](sequences/README.md#keys-and-indexes-used-in-these-diagrams).

### 1a. Spending, budgets, and currency

```mermaid
classDiagram
    direction LR
    class Currency {
        <<enumeration>>
        USD
        CRC
    }
    class TransactionKind {
        <<enumeration>>
        purchase
        refund
        income
        sinpe_sent
        sinpe_received
        transfer
        card_payment
    }
    class TransactionStatus {
        <<enumeration>>
        confirmed
        pending_review
    }
    class TransactionSource {
        <<enumeration>>
        manual
        gmail
        csv
    }
    class BudgetPeriod {
        <<enumeration>>
        WEEKLY
        MONTHLY
        QUARTERLY
        YEARLY
        CUSTOM
    }
    class Transaction {
        +string id
        +string userId
        +string accountId
        +string localDate
        +string occurredAt
        +TransactionKind kind
        +TransactionStatus status
        +Currency currency
        +number amountMinor
        +number amountUsdCents
        +number fxRate
        +string fxDate
        +string categoryId
        +string[] tagIds
        +string categorizedBy
        +string merchantRaw
        +string merchantKey
        +TransactionSource[] sources
        +string statementRef
        +string possibleDuplicateOf
        +string reviewReason
        +number version
        +countsAsSpending() boolean
    }
    class Account {
        +string id
        +string bank
        +string type
        +Currency currency
        +string last4
        +string name
    }
    class UserSettings {
        +string userId
        +string timeZone
        +string weekStart
        +Currency baseCurrency
    }
    class Category {
        +string id
        +string name
        +string scope
        +boolean archived
    }
    class Tag {
        +string id
        +string name
        +string scope
        +boolean archived
    }
    class Rule {
        +string merchantKey
        +string categoryId
        +string[] tagIds
        +string scope
    }
    class Budget {
        +string id
        +string name
        +string[] categoryIds
        +string[] tagIds
        +BudgetPeriod period
        +number limitCents
        +string startDate
        +string endDate
        +number version
    }
    class BudgetPeriodTotal {
        +string budgetId
        +string periodStart
        +number spentCents
        +number count
        +number limitCents
    }
    class BudgetDayTotal {
        +string budgetId
        +string date
        +number spentCents
    }
    class SpendingRollup {
        +string bucket
        +string dimension
        +string dimensionId
        +number expenseCents
        +number incomeCents
        +number count
    }
    class FxRate {
        +string date
        +number rate
        +string rateDate
        +string source
    }
    class UsdConversion {
        +number amountUsdCents
        +number fxRate
        +string fxDate
    }
    Transaction "*" --> "1" Account : on
    Transaction "*" --> "0..1" Category : filed as
    Transaction "*" --> "*" Tag : tagged
    Transaction ..> UsdConversion : stores
    UsdConversion ..> FxRate : from
    Rule "*" --> "1" Category : sets
    Rule "*" --> "*" Tag : sets
    Budget "*" --> "*" Category : targets
    Budget "*" --> "*" Tag : targets any of
    Budget "1" *-- "*" BudgetPeriodTotal : per period
    Budget "1" *-- "*" BudgetDayTotal : per day
    SpendingRollup ..> Transaction : sums
```

`Transaction.countsAsSpending()` is false for `income`, `transfer`, and `card_payment`. Those
kinds never enter expense rollups or budgets. `SpendingRollup` covers the `DAY#`, `MONTH#`,
`CAT#`, and `TAG#` items; `dimension` is `TOTAL`, `CAT`, or `TAG`. `UserSettings` is the
`PROFILE` item in `Reference`; `baseCurrency` is always `USD` in this iteration, and
`timeZone` decides each transaction's `localDate`.

### 1b. Ingestion and investments

```mermaid
classDiagram
    direction LR
    class InvestmentType {
        <<enumeration>>
        DEPOSIT
        WITHDRAWAL
        BUY
        SELL
    }
    class InvestmentTransaction {
        +string id
        +string userId
        +string brokerId
        +InvestmentType type
        +string localDate
        +string ticker
        +number quantityMicro
        +number grossCents
        +number amountCents
        +number commissionCents
        +string name
        +number version
    }
    class Broker {
        +string id
        +string name
        +number flatCents
        +number percentBps
        +number version
        +sellCommission(marketValueCents) number
    }
    class Holding {
        +string brokerId
        +string ticker
        +number quantityMicro
        +number costBasisCents
        +number realizedGainCents
        +number version
    }
    class BrokerCash {
        +string brokerId
        +number balanceCents
    }
    class InvestmentMonthRollup {
        +string month
        +number depositedCents
        +number withdrawnCents
        +number boughtCents
        +number soldCents
        +number commissionsCents
        +number realizedGainCents
    }
    class Price {
        +string ticker
        +number priceCents
        +string retrievedAt
        +boolean stale
    }
    class Connection {
        +string id
        +string type
        +string status
        +string tokenPrefix
        +string lastSeenAt
        +isStale(now) boolean
    }
    class IngestToken {
        +string tokenHash
        +string userId
        +string connectionId
    }
    class IngestMessage {
        +string messageId
        +string status
        +string templateId
        +string transactionId
        +string rawRef
        +number ttl
    }
    class ImportJob {
        +string id
        +string accountId
        +string fileHash
        +string status
        +string templateId
        +number imported
        +number merged
        +number skipped
        +RowError[] rowErrors
    }
    class RowError {
        +number row
        +string reason
    }
    class ParsedTransaction {
        +string accountLast4
        +string localDate
        +string occurredAt
        +string kind
        +string currency
        +number amountMinor
        +string merchantRaw
        +string statementRef
        +string source
        +string sourceRef
    }
    InvestmentTransaction "*" --> "1" Broker : at
    Holding "*" --> "1" Broker : held at
    BrokerCash "1" --> "1" Broker : cash at
    Holding ..> Price : valued with
    InvestmentMonthRollup ..> InvestmentTransaction : sums
    IngestToken "1" --> "1" Connection : authenticates
    IngestMessage ..> ParsedTransaction : parsed into
    ImportJob "1" *-- "*" RowError
    ImportJob ..> ParsedTransaction : rows parsed into
```

`ParsedTransaction` is what a template produces, before currency conversion, duplicate
matching, and categorization turn it into a `Transaction`. `Broker.sellCommission` is
`flatCents + marketValueCents × percentBps / 10000`, used to estimate the cost of selling.

---
## 2. Next.js layer

Pages are React Server Components. Server Actions are the UI controllers: they read the
session, call the API through `ApiClient`, and return data or errors to the page.
`ApiClient` uses the request and response types from `shared/`, so the UI and `ApiFn` agree
on the contract.

```mermaid
classDiagram
    direction LR
    class SessionService {
        +getSession(cookies) Session
        +requireIdToken(cookies) string
        +refresh(session) Session
        +signOut(cookies) void
    }
    class Session {
        +string userId
        +string idToken
        +string refreshToken
        +number expiresAt
    }
    class ApiClient {
        -string baseUrl
        +get(path, token) Response
        +post(path, body, token) Response
        +patch(path, body, token) Response
        +put(path, body, token) Response
        +delete(path, token) Response
    }
    class TransactionActions {
        <<Server Actions>>
        +createTransaction(input) Transaction
        +updateTransaction(id, changes) Transaction
        +listTransactions(from, to) Transaction[]
    }
    class ImportActions {
        <<Server Actions>>
        +startImport(accountId, fileName, sha256) ImportStart
        +getImport(id) ImportJob
    }
    class ReviewActions {
        <<Server Actions>>
        +listReview() ReviewList
        +mergeDuplicate(keepId, dropId) void
        +dismissDuplicate(id) void
        +saveRule(merchantKey, categoryId, tagIds) Rule
    }
    class ConnectionActions {
        <<Server Actions>>
        +connectGmail() GmailSetup
        +listConnections() Connection[]
        +rotateGmail(id) GmailSetup
        +revokeConnection(id) void
    }
    class BudgetActions {
        <<Server Actions>>
        +createBudget(input) Budget
        +updateBudget(id, changes) Budget
        +getProgress() BudgetProgress[]
        +getBurndown(id) BurndownSeries
    }
    class InvestmentActions {
        <<Server Actions>>
        +recordInvestment(input) InvestmentTransaction
        +correctInvestment(id, changes) InvestmentTransaction
        +updateBroker(id, rule) Broker
        +getValuation() Valuation
        +getLiquidation() Liquidation
    }
    class AnalyticsLoader {
        <<server-side data loader>>
        +spendingByCategory(month) CategoryShare[]
        +spendingByTag(month) TagTotal[]
        +monthlyTotals(from, to) MonthTotal[]
    }
    class DashboardPage {
        <<page /dashboard>>
    }
    class TransactionsPage {
        <<page /transactions>>
    }
    class ImportPage {
        <<page /import>>
    }
    class ReviewPage {
        <<page /review>>
    }
    class ConnectionsPage {
        <<page /connections>>
    }
    class BudgetsPage {
        <<page /budgets>>
    }
    class CashflowPage {
        <<page /cashflow>>
    }
    class PortfolioPage {
        <<page /portfolio>>
    }
    SessionService --> Session
    TransactionActions --> SessionService
    TransactionActions --> ApiClient
    ImportActions --> ApiClient
    ReviewActions --> ApiClient
    ConnectionActions --> ApiClient
    BudgetActions --> ApiClient
    InvestmentActions --> ApiClient
    AnalyticsLoader --> SessionService
    AnalyticsLoader --> ApiClient
    DashboardPage --> AnalyticsLoader
    DashboardPage --> BudgetActions
    CashflowPage --> AnalyticsLoader
    TransactionsPage --> TransactionActions
    ImportPage --> ImportActions
    ReviewPage --> ReviewActions
    ConnectionsPage --> ConnectionActions
    BudgetsPage --> BudgetActions
    PortfolioPage --> InvestmentActions
```

Every Server Action and the `AnalyticsLoader` call `SessionService` first; only one of those
edges is drawn to keep the diagram readable. `SessionService` keeps the Cognito tokens in
`HttpOnly`, `SameSite=Strict` cookies and gives `ApiClient` the ID token to send as a bearer
token, so browser JavaScript never sees it. The CSV upload itself goes from the browser
straight to S3 using the presigned form returned by `startImport`.

---
## 3. API shell and data access

`ApiHandler` is the `ApiFn` entry point: one Powertools `Router` with one feature router
mounted per route prefix. `ImportWorkerHandler` is the `ImportWorkerFn` entry point for S3
events. The routers are the API controllers: they read `AuthContext`, validate the body
with the shared Zod schemas, call one service method, and return JSON.

### 3a. Entry points, routers, and errors

```mermaid
classDiagram
    direction LR
    class ApiHandler {
        <<Lambda entry ApiFn>>
        -Router app
        +handler(event, context) Result
        -mountRouters() void
    }
    class ImportWorkerHandler {
        <<Lambda entry ImportWorkerFn>>
        +handler(event) void
    }
    class AuthContext {
        +string userId
        +fromCognitoClaims(event)$ AuthContext
    }
    class ErrorHandler {
        +register(app) void
        +toResponse(error) Result
    }
    class AppError {
        <<abstract>>
        +string code
        +number status
        +string message
    }
    class ValidationError
    class UnauthorizedError
    class NotFoundError
    class ConflictError
    class FxUnavailableError
    class RequestSchemas {
        <<shared Zod schemas>>
        +NewTransaction
        +TransactionChanges
        +NewImport
        +RuleInput
        +NewBudget
        +BudgetChanges
        +NewInvestmentTransaction
        +BrokerRule
    }
    class TransactionsRouter
    class ImportsRouter
    class ReviewRouter
    class RulesRouter
    class ConnectionsRouter
    class IngestRouter
    class BudgetsRouter
    class AnalyticsRouter
    class InvestmentsRouter
    class BrokersRouter
    class PortfolioRouter
    AppError <|-- ValidationError
    AppError <|-- UnauthorizedError
    AppError <|-- NotFoundError
    AppError <|-- ConflictError
    AppError <|-- FxUnavailableError
    ApiHandler --> ErrorHandler
    ApiHandler --> TransactionsRouter
    ApiHandler --> ImportsRouter
    ApiHandler --> ReviewRouter
    ApiHandler --> RulesRouter
    ApiHandler --> ConnectionsRouter
    ApiHandler --> IngestRouter
    ApiHandler --> BudgetsRouter
    ApiHandler --> AnalyticsRouter
    ApiHandler --> InvestmentsRouter
    ApiHandler --> BrokersRouter
    ApiHandler --> PortfolioRouter
    ErrorHandler ..> AppError : maps
    TransactionsRouter ..> AuthContext
    TransactionsRouter ..> RequestSchemas
```

Every router uses `AuthContext` and `RequestSchemas` the way `TransactionsRouter` does; only
that pair of edges is drawn. `IngestRouter` is the exception: it has no Cognito claims and
authenticates the Gmail ingest token through `ConnectionService` instead.
`ErrorHandler` maps `ValidationError` to 400, `UnauthorizedError` to 401, `NotFoundError` to
404, `ConflictError` to 409, `FxUnavailableError` to 503, and anything else to 500, always as
`{code, message}`.

**Routes per router.** Each route calls the service method named in its sequence diagram.

| Router | Routes | Service |
|---|---|---|
| `TransactionsRouter` | `POST /api/transactions`, `GET /api/transactions`, `PATCH /api/transactions/{id}` | `TransactionService`, `TransactionQueryService` |
| `ImportsRouter` | `POST /api/imports`, `GET /api/imports/{id}` | `ImportService` |
| `ReviewRouter` | `GET /api/review`, `POST /api/review/duplicates/merge`, `POST /api/review/duplicates/dismiss` | `ReviewService`, `TransactionService` |
| `RulesRouter` | `PUT /api/rules/{merchantKey}` | `RuleService` |
| `ConnectionsRouter` | `POST /api/connections/gmail`, `GET /api/connections`, `POST /api/connections/gmail/{id}/rotate`, `DELETE /api/connections/{id}` | `ConnectionService` |
| `IngestRouter` | `GET /ingest/gmail/config`, `POST /ingest/gmail`, `POST /ingest/gmail/heartbeat` | `ConnectionService`, `IngestPipeline` |
| `BudgetsRouter` | `POST /api/budgets`, `PATCH /api/budgets/{id}` | `BudgetService` |
| `AnalyticsRouter` | `GET /api/analytics/spending`, `GET /api/analytics/budgets`, `GET /api/analytics/budgets/{id}` | `SpendingAnalyticsService`, `BudgetAnalyticsService` |
| `InvestmentsRouter` | `POST /api/investments/transactions`, `PATCH /api/investments/transactions/{id}` | `InvestmentService` |
| `BrokersRouter` | `PUT /api/brokers/{id}` | `BrokerService` |
| `PortfolioRouter` | `GET /api/portfolio/valuation`, `GET /api/portfolio/liquidation` | `ValuationService` |

### 3b. Configuration and factories

```mermaid
classDiagram
    direction LR
    class Config {
        +getRequired(name)$ string
        +string transactionsTable
        +string investmentTxTable
        +string aggregatesTable
        +string referenceTable
        +string ingestionTable
        +string rawBucket
        +string bccrParamPrefix
        +string priceApiKeyParam
    }
    class ServiceFactory {
        <<singletons per Lambda container>>
        +transactionService() TransactionService
        +ingestPipeline() IngestPipeline
        +importService() ImportService
        +connectionService() ConnectionService
        +budgetService() BudgetService
        +investmentService() InvestmentService
        +valuationService() ValuationService
    }
    class Clock {
        <<interface>>
        +now() Date
        +today(timeZone) string
    }
    class SystemClock
    class ApiHandler
    class ImportWorkerHandler
    Clock <|.. SystemClock
    ServiceFactory --> Config
    ServiceFactory --> Clock
    ApiHandler --> ServiceFactory
    ImportWorkerHandler --> ServiceFactory
```

`Config.getRequired` throws at start-up if an environment variable is missing, so a
misconfigured Lambda fails on its first request instead of part way through one. Environment
variables hold table names, the bucket name, and SSM parameter names, never secret values.

### 3c. Repositories (database handlers)

Repositories are the only classes that call DynamoDB, S3, or SSM. There is one repository per
DynamoDB table, all built on `DynamoStore`, and every key is built by `Keys`. Methods ending
in `Item` return a `TransactItem` instead of writing, so a service can combine writes to
several tables in one `DynamoStore.transactWrite`.

```mermaid
classDiagram
    direction LR
    class DynamoStore {
        -DynamoDBDocumentClient client
        +get(table, key) Item
        +query(table, keyCondition, options) Page
        +put(table, item, condition) void
        +update(table, key, expression, condition) void
        +batchGet(table, keys) Item[]
        +batchWrite(table, puts, deletes) void
        +transactWrite(items) void
    }
    class Keys {
        <<keys.ts>>
        +user(userId)$ string
        +txn(date, id)$ string
        +inv(date, id)$ string
        +day(date)$ string
        +month(month, dimension, id)$ string
        +budgetPeriod(budgetId, periodStart)$ string
        +budgetDay(budgetId, date)$ string
        +holding(brokerId, ticker)$ string
        +cash(brokerId)$ string
        +fx(date)$ string
        +price(ticker)$ string
        +token(hash)$ string
    }
    class TransactionRepository {
        +get(userId, id) Transaction
        +listByDate(userId, from, to) Transaction[]
        +findNear(userId, accountId, from, to) Transaction[]
        +listReview(userId, reason) Transaction[]
        +putItem(txn) TransactItem
        +updateItem(txn, expectedVersion) TransactItem
        +deleteItem(txn) TransactItem
    }
    class InvestmentTxRepository {
        +get(userId, id) InvestmentTransaction
        +listByTicker(userId, ticker) InvestmentTransaction[]
        +putItem(tx) TransactItem
        +update(tx, expectedVersion) void
    }
    class AggregateRepository {
        +getMonth(userId, month, dimension) SpendingRollup[]
        +getMonths(userId, months) SpendingRollup[]
        +getBudgetPeriods(userId, keys) BudgetPeriodTotal[]
        +getBudgetDays(userId, budgetId, from, to) BudgetDayTotal[]
        +replaceBudgetItems(userId, budgetId, periods, days) void
        +addItems(deltas) TransactItem[]
        +getHoldings(userId) Holding[]
        +getCash(userId) BrokerCash[]
        +putHolding(userId, holding, expectedVersion) void
        +getFxRate(date) FxRate
        +putFxRate(rate) void
        +getPrices(tickers) Price[]
        +putPrice(price) void
    }
    class ReferenceRepository {
        +getSettings(userId) UserSettings
        +getAccount(userId, id) Account
        +getCategories(userId, ids) Category[]
        +getTags(userId, ids) Tag[]
        +getRule(scope, merchantKey) Rule
        +putRule(userId, rule) void
        +listBudgets(userId) Budget[]
        +putBudget(userId, budget) void
        +updateBudget(userId, budget, expectedVersion) void
        +getBroker(userId, id) Broker
        +listBrokers(userId) Broker[]
        +updateBroker(userId, broker, expectedVersion) void
    }
    class IngestionRepository {
        +claimFile(userId, sha256) boolean
        +claimMessage(userId, messageId) boolean
        +claimRow(userId, fingerprint) boolean
        +putImport(userId, job) void
        +updateImport(userId, job) void
        +getImport(userId, id) ImportJob
        +updateMessage(userId, message) void
        +listUnparsed(userId) IngestMessage[]
        +getToken(hash) IngestToken
        +listConnections(userId) Connection[]
        +writeConnection(connection, putToken, deleteToken) void
        +touchConnection(userId, connectionId, at) void
    }
    class RawObjectStore {
        +putRawEmail(userId, messageId, mime) string
        +presignCsvUpload(userId, importId, maxBytes) PresignedPost
        +getObject(key) string
    }
    class ParameterStore {
        +getParameters(prefix) Map
    }
    TransactionRepository --> DynamoStore
    InvestmentTxRepository --> DynamoStore
    AggregateRepository --> DynamoStore
    ReferenceRepository --> DynamoStore
    IngestionRepository --> DynamoStore
    TransactionRepository ..> Keys
    InvestmentTxRepository ..> Keys
    AggregateRepository ..> Keys
    ReferenceRepository ..> Keys
    IngestionRepository ..> Keys
```

The `claim...` methods are conditional puts with `attribute_not_exists` and return `false`
when the item already exists. They are how the pipeline makes every source idempotent.
Repositories strip `PK` and `SK` before returning items, so services never see key strings.

---
## 4. Transactions core

Manual entry, Gmail alerts, and CSV rows all end in `TransactionService`. It converts to USD,
categorizes, matches budgets, and asks `RollupPlanner` for every rollup change, then writes
the transaction and all rollups in one `TransactWriteItems`. Updates and merges subtract the
old contribution and add the new one in the same call, guarded by `version`.

```mermaid
classDiagram
    direction LR
    class TransactionService {
        +create(userId, input) Transaction
        +save(userId, parsed, categorization) Transaction
        +update(userId, id, changes, actor) Transaction
        +merge(userId, keepId, dropId) Transaction
        -write(oldTxn, newTxn) void
    }
    class TransactionQueryService {
        +list(userId, from, to, filter) Transaction[]
    }
    class RollupPlanner {
        +plan(oldTxn, newTxn, oldBudgets, newBudgets) RollupDelta[]
        -spendingDeltas(txn, sign) RollupDelta[]
        -budgetDeltas(matches, txn, sign) RollupDelta[]
    }
    class RollupDelta {
        +string key
        +number expenseCents
        +number incomeCents
        +number count
        +number limitCents
    }
    class FxService
    class Categorizer
    class Normalizer
    class BudgetMatcher
    class ReferenceRepository
    class TransactionRepository
    class AggregateRepository
    class DynamoStore
    TransactionService --> FxService : toUsd
    TransactionService --> Normalizer : merchantKey
    TransactionService --> Categorizer : manual entries
    TransactionService --> BudgetMatcher : matching
    TransactionService --> RollupPlanner : plan
    TransactionService --> ReferenceRepository : budgets, categories, tags
    TransactionService --> TransactionRepository : txn items
    TransactionService --> AggregateRepository : rollup items
    TransactionService --> DynamoStore : transactWrite
    RollupPlanner ..> RollupDelta : creates
    TransactionQueryService --> TransactionRepository
```

`save` is called by `IngestPipeline` with a categorization it has already done; `create` is
the manual-entry path and categorizes itself. `RollupPlanner` skips expense rollups and
budgets when `countsAsSpending()` is false, and only touches `incomeCents` for income. When
the `version` condition fails, `TransactionService` re-reads and retries once, then throws
`ConflictError`. A missing rate makes `FxService` throw `FxUnavailableError` and nothing is
written.

---
## 5. Module 01: Accounts and Ingestion

### 5a. CSV import and the shared pipeline

`IngestPipeline` handles both CSV rows and Gmail emails. Each source is claimed first
(`FILE#`, `ROWFP#`, `MSG#`), so a repeat delivery is skipped. Templates are declarative
config objects; the two parsers are generic and interpret them.

```mermaid
classDiagram
    direction LR
    class ImportService {
        +createImport(userId, accountId, sha256) ImportStart
        +getImport(userId, importId) ImportJob
    }
    class IngestPipeline {
        +processCsv(userId, importId) ImportJob
        +processEmail(userId, rawRef) IngestResult
        -ingest(userId, parsed, source) IngestResult
        -rowFingerprint(row, index) string
    }
    class TemplateRegistry {
        +detect(headerRow) CsvTemplate
        +match(sender, subject) EmailTemplate
        +senderAllowlist() string[]
    }
    class Template {
        <<interface>>
        +string id
        +string bank
        +string numberFormat
        +string dateFormat
    }
    class CsvTemplate {
        +string[] headerRow
        +string encoding
        +string delimiter
        +Map columns
        +string currencySource
    }
    class EmailTemplate {
        +string[] senders
        +RegExp subject
        +Map fieldPatterns
        +string kind
    }
    class CsvTemplateParser {
        +parseRow(row, template, account) ParsedTransaction
    }
    class EmailTemplateParser {
        +parse(mime, template) ParsedTransaction
    }
    class ParsedRowSchema {
        <<Zod schema>>
        +validate(parsed) ParsedTransaction
    }
    class DuplicateMatcher {
        +findMatch(userId, parsed) DuplicateMatch
        -windowFor(source) number
    }
    class DuplicateMatch {
        +string type
        +Transaction existing
    }
    class TransactionService
    class Categorizer
    class Normalizer
    class FxService
    class IngestionRepository
    class ReferenceRepository
    class RawObjectStore
    class TransactionRepository
    Template <|.. CsvTemplate
    Template <|.. EmailTemplate
    ImportService --> IngestionRepository : claimFile, putImport
    ImportService --> RawObjectStore : presignCsvUpload
    IngestPipeline --> TemplateRegistry
    IngestPipeline --> CsvTemplateParser
    IngestPipeline --> EmailTemplateParser
    IngestPipeline --> ParsedRowSchema
    IngestPipeline --> Normalizer
    IngestPipeline --> FxService
    IngestPipeline --> DuplicateMatcher
    IngestPipeline --> Categorizer
    IngestPipeline --> TransactionService : save or merge
    IngestPipeline --> IngestionRepository : claims, import status
    IngestPipeline --> ReferenceRepository : account by last 4
    IngestPipeline --> RawObjectStore : read CSV
    CsvTemplateParser ..> CsvTemplate
    EmailTemplateParser ..> EmailTemplate
    DuplicateMatcher --> TransactionRepository : findNear
    DuplicateMatcher ..> DuplicateMatch : returns
```

`DuplicateMatch.type` is `exact` (merge into the existing transaction), `near` (save with
`possibleDuplicateOf` set), or `none`. The match key is the original amount, the account, and
a date window of the same day when a statement gives the transaction date. Templates live in
code under `api/src/ingest/templates/`, with golden tests that run each redacted sample
email and CSV through the parser.

### 5b. Gmail connection and review inbox

```mermaid
classDiagram
    direction LR
    class ConnectionService {
        +createGmail(userId) GmailSetup
        +authenticate(token) IngestToken
        +list(userId) Connection[]
        +rotate(userId, connectionId) GmailSetup
        +revoke(userId, connectionId) void
        +heartbeat(token) void
        -newToken() string
        -hash(token) string
    }
    class GmailSetup {
        +string connectionId
        +string token
        +string script
    }
    class DkimVerifier {
        +verify(mime, allowedDomains) boolean
    }
    class ReviewService {
        +list(userId) ReviewList
        +listDuplicates(userId) DuplicatePair[]
        +dismiss(userId, transactionId) void
    }
    class ReviewList {
        +Transaction[] uncategorized
        +DuplicatePair[] duplicates
        +IngestMessage[] unparsed
        +number count
    }
    class IngestPipeline
    class TemplateRegistry
    class IngestionRepository
    class TransactionRepository
    ConnectionService --> IngestionRepository : TOKEN#, CONN#
    ConnectionService --> TemplateRegistry : senderAllowlist
    ConnectionService ..> GmailSetup : returns
    IngestPipeline --> DkimVerifier
    ReviewService --> TransactionRepository : review GSI
    ReviewService --> IngestionRepository : unparsed MSG#
    ReviewService ..> ReviewList : returns
```

`ConnectionService.authenticate` hashes the bearer token and looks up `TOKEN#<sha256>`. A
revoked token has no item, so the lookup fails and `IngestRouter` returns `401`. The token is
returned only once, from `createGmail` or `rotate`, and is never stored or logged.
`isStale(now)` on `Connection` compares `lastSeenAt` with a 24-hour threshold (01-S09).

---
## 6. Module 02: Categorization and Rules

```mermaid
classDiagram
    direction LR
    class Normalizer {
        +normalize(merchantRaw) string
    }
    class Categorizer {
        +categorize(userId, merchantKey) Categorization
    }
    class Categorization {
        +string categoryId
        +string[] tagIds
        +string categorizedBy
        +string status
    }
    class RuleService {
        +upsert(userId, merchantKey, categoryId, tagIds) Rule
    }
    class ReferenceRepository
    Categorizer --> ReferenceRepository : user rule, then GLOBAL rule
    Categorizer ..> Categorization : returns
    RuleService --> ReferenceRepository : validate IDs, putRule
```

`Normalizer` lower-cases the merchant text, strips digits, store numbers, and padding, and
returns a stable `merchantKey` such as `automercado`. `Categorizer` returns
`categorizedBy = rule` for a user rule, `global` for a global rule, and status
`pending_review` with no category when nothing matches. It is deterministic. Category and tag
changes on an existing transaction go through `TransactionService.update` (section 4), and a
category set by the user (`categorizedBy = user`) is never replaced by a merge.

---

## 7. Module 03: Budgets

```mermaid
classDiagram
    direction LR
    class BudgetService {
        +create(userId, input) Budget
        +update(userId, budgetId, changes) Budget
        -backfill(userId, budget) void
    }
    class BudgetMatcher {
        +matches(txn, budget) boolean
        +matching(txn, budgets) BudgetMatch[]
    }
    class BudgetMatch {
        +string budgetId
        +string periodStart
        +number limitCents
    }
    class PeriodCalculator {
        +periodStart(localDate, budget, weekStart) string
        +periods(budget, count, today) string[]
        +daysInPeriod(periodStart, budget) number
    }
    class BudgetAnalyticsService {
        +progress(userId, today) BudgetProgress[]
        +burndown(userId, budgetId, today) BurndownSeries
    }
    class BudgetProgress {
        +Budget budget
        +number spentCents
        +number limitCents
        +number remainingCents
        +number percent
        +number overByCents
    }
    class BurndownSeries {
        +string[] dates
        +number[] cumulativeSpentCents
        +number[] paceCents
    }
    class ReferenceRepository
    class TransactionRepository
    class AggregateRepository
    BudgetService --> ReferenceRepository : validate IDs, BUDGET#
    BudgetService --> TransactionRepository : listByDate for backfill
    BudgetService --> AggregateRepository : replaceBudgetItems
    BudgetService --> BudgetMatcher
    BudgetService --> PeriodCalculator
    BudgetMatcher --> PeriodCalculator
    BudgetMatcher ..> BudgetMatch : returns
    BudgetAnalyticsService --> ReferenceRepository : listBudgets
    BudgetAnalyticsService --> AggregateRepository : P# and D# items
    BudgetAnalyticsService --> PeriodCalculator
    BudgetAnalyticsService ..> BudgetProgress : returns
    BudgetAnalyticsService ..> BurndownSeries : returns
```

`BudgetMatcher.matches` returns true when `txn.countsAsSpending()`, the transaction's
category is in `categoryIds` (or the list is empty), and it has any of `tagIds` (or the list
is empty). `BudgetProgress.percent` is `round(spent / limit × 100)` with no upper bound, so
an exceeded budget reads above 100. `BurndownSeries.paceCents` is the even-spending line,
`limit × day ÷ daysInPeriod`. The week-start day and time zone come from the user's settings.

---
## 8. Module 04: Dashboard

```mermaid
classDiagram
    direction LR
    class SpendingAnalyticsService {
        +byCategory(userId, month) CategoryShare[]
        +byTag(userId, month) TagTotal[]
        +totals(userId, fromMonth, toMonth) MonthTotal[]
    }
    class CategoryShare {
        +string categoryId
        +string name
        +number expenseCents
        +number share
    }
    class TagTotal {
        +string tagId
        +string name
        +number expenseCents
        +number budgetLimitCents
    }
    class MonthTotal {
        +string month
        +number incomeCents
        +number expenseCents
    }
    class AggregateRepository
    class ReferenceRepository
    SpendingAnalyticsService --> AggregateRepository : MONTH# items
    SpendingAnalyticsService --> ReferenceRepository : category and tag names
    SpendingAnalyticsService ..> CategoryShare : returns
    SpendingAnalyticsService ..> TagTotal : returns
    SpendingAnalyticsService ..> MonthTotal : returns
```

`byCategory` keeps `Uncategorized` as its own row instead of dropping it. `totals` returns
one point per month in the range, filling months with no rollup item as zero, so a month
with no income shows as `$0` and not as a gap. Tag totals can overlap, because a transaction
with two tags counts in both.

---
## 9. Module 05: Multi-Currency

```mermaid
classDiagram
    direction LR
    class FxService {
        +toUsd(amountMinor, currency, localDate) UsdConversion
        -convert(amountMinor, rate) number
    }
    class FxRateProvider {
        <<interface>>
        +rateFor(date) FxRate
    }
    class BccrRateProvider {
        -string endpoint
        -string indicator
        -string token
        +rateFor(date) FxRate
        -buildUrl(fromDate, toDate) string
        -parseSeries(json) FxRate[]
    }
    class UsdConversion
    class FxRate
    class AggregateRepository
    class ParameterStore
    class FxUnavailableError
    FxRateProvider <|.. BccrRateProvider
    FxService --> FxRateProvider
    FxService --> AggregateRepository : FX# cache
    FxService ..> UsdConversion : returns
    FxService ..> FxUnavailableError : throws
    BccrRateProvider --> ParameterStore : /FinanceApp/bccr/*
    BccrRateProvider ..> FxRate : returns
```

- `FxService.toUsd` returns the amount unchanged with rate `1.0` for USD. For CRC it reads
  `FX#USD-CRC#<date>`, asks the provider on a cache miss, and stores the result.
- `convert` divides with exact integer arithmetic and rounds half-to-even to cents.
- `BccrRateProvider` reads `endpoint`, `indicator`, and `token` from Parameter Store once per
  Lambda container. `buildUrl` produces
  `{endpoint}/{indicator}/series?fechaInicio=yyyy/mm/dd&fechaFin=yyyy/mm/dd&idioma=ES`,
  with the query built by `URLSearchParams`. Every request sends the header
  `Authorization: Bearer <token>`.
- `parseSeries` reads `datos[0].series`, an array of `{ fecha, valorDatoPorPeriodo }` where
  `fecha` is the date and `valorDatoPorPeriodo` is the colones-per-dollar rate. A non-`200`
  status or an empty `series` array means no rate.
- When a date has no rate (weekend or holiday), the provider asks for the 7 days before and
  returns the latest earlier rate with its own `rateDate`.
- If BCCR cannot be reached and nothing is cached, `FxUnavailableError` (503) is thrown and
  the save is refused instead of using a guessed rate.

---
## 10. Module 07: Investments

```mermaid
classDiagram
    direction LR
    class InvestmentService {
        +record(userId, input) InvestmentTransaction
        +correct(userId, id, changes) InvestmentTransaction
    }
    class HoldingCalculator {
        +applyBuy(holding, tx) Holding
        +applySell(holding, tx) SellResult
        +replay(trades) Holding
        +cashDelta(tx) number
    }
    class SellResult {
        +Holding holding
        +number costRemovedCents
        +number realizedGainCents
    }
    class BrokerService {
        +update(userId, brokerId, rule, version) Broker
    }
    class ValuationService {
        +value(userId) Valuation
        +liquidation(userId) Liquidation
    }
    class Valuation {
        +HoldingValue[] holdings
        +number totalValueCents
    }
    class HoldingValue {
        +Holding holding
        +Price price
        +number marketValueCents
    }
    class Liquidation {
        +HoldingExit[] holdings
        +number cashCents
        +number totalCents
        +string priceTime
    }
    class HoldingExit {
        +string ticker
        +number marketValueCents
        +number sellCommissionCents
        +number netCents
        +number unrealizedGainCents
    }
    class PriceClient {
        +prices(tickers) Price[]
    }
    class MarketPriceProvider {
        <<interface>>
        +quote(ticker) number
    }
    class HttpMarketPriceProvider {
        -string apiKey
        +quote(ticker) number
    }
    class InvestmentTxRepository
    class AggregateRepository
    class ReferenceRepository
    class ParameterStore
    class DynamoStore
    InvestmentService --> ReferenceRepository : broker exists
    InvestmentService --> InvestmentTxRepository : INV# items, ticker GSI
    InvestmentService --> AggregateRepository : HOLDING#, CASH#, MONTH#INV
    InvestmentService --> HoldingCalculator
    InvestmentService --> DynamoStore : transactWrite
    HoldingCalculator ..> SellResult : returns
    BrokerService --> ReferenceRepository : BROKER#
    ValuationService --> AggregateRepository : HOLDING#, CASH#
    ValuationService --> ReferenceRepository : broker rules
    ValuationService --> PriceClient
    ValuationService ..> Valuation : returns
    ValuationService ..> Liquidation : returns
    Valuation *-- HoldingValue
    Liquidation *-- HoldingExit
    PriceClient --> AggregateRepository : PRICE# cache, 15 min TTL
    PriceClient --> MarketPriceProvider
    MarketPriceProvider <|.. HttpMarketPriceProvider
    HttpMarketPriceProvider --> ParameterStore : API key
```

- **Average cost.** `HoldingCalculator.applySell` removes
  `costBasis × soldQuantity ÷ quantity` and records `realizedGain = gross − commission −
  costRemoved`. The write is conditioned on `version` and on `quantityMicro ≥ sold`, so a
  sale larger than the holding is rejected with `ConflictError`.
- **Corrections.** `correct` updates the investment transaction, then `replay` rebuilds the
  holding from every trade for that ticker in date order, because an edited old trade changes
  the cost of every later sale.
- **Prices.** `PriceClient` returns the cached price when it is under 15 minutes old.
  Otherwise it asks the provider, and when the provider fails it returns the last known price
  marked `stale`. The price API provider is still to be chosen, so it sits behind
  `MarketPriceProvider`.
- **Selling estimate.** `liquidation` uses `Broker.sellCommission` per holding and adds broker
  cash. It is a before-tax figure and never a recommendation.

---
## 11. Gmail Apps Script

The script runs in the user's own Google account, not in AWS. It is plain Apps Script
(JavaScript) and talks to the product only through the three `/ingest/gmail` routes.

```mermaid
classDiagram
    direction LR
    class GmailIngestScript {
        <<Apps Script>>
        -string apiBase
        +setup() void
        +run() void
        -fetchConfig() IngestConfig
        -findUnprocessed(senders) GmailMessage[]
        -send(message) number
        -markProcessed(message) void
        -heartbeat() void
    }
    class IngestConfig {
        +string[] senders
        +string label
    }
    class PropertiesService {
        <<Google>>
        +getScriptProperties() Properties
    }
    class GmailApp {
        <<Google>>
        +search(query) GmailThread[]
        +getUserLabelByName(name) GmailLabel
    }
    class UrlFetchApp {
        <<Google>>
        +fetch(url, options) HTTPResponse
    }
    class IngestRouter
    GmailIngestScript --> PropertiesService : ingest token
    GmailIngestScript --> GmailApp : search, label
    GmailIngestScript --> UrlFetchApp : HTTPS calls
    GmailIngestScript ..> IngestConfig : from config route
    UrlFetchApp ..> IngestRouter : /ingest/gmail
```

- `setup()` checks the token by calling `GET /ingest/gmail/config`, then creates a 5-minute
  time trigger for `run()`.
- `run()` searches for allowlisted senders without the `yourapp-processed` label and sends
  each message's raw MIME (`getRawContent()`) to `POST /ingest/gmail`.
- A message is labelled only after a `2xx` response, so failures are retried on the next run.
  A `401` removes the trigger, because the token was revoked.
- Every run ends with `POST /ingest/gmail/heartbeat`, which keeps the connection from being
  marked stale during a week with no purchases.
- The token is read from `PropertiesService`, never written in the script source.
