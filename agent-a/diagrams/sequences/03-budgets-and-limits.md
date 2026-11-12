# 03 Budgets and Limits — Sequence Diagrams

Module 03 of the [context model](../context.md). A budget targets categories and/or tags,
using the same `CAT#` and `TAG#` items as transactions. A transaction matches a budget when
its category is in the budget's categories (or the budget has none) and it has any of the
budget's tags (or the budget has none). The period is weekly, monthly, quarterly, yearly,
or a custom range.

Spending is kept in budget rollup items in `Aggregates`, written in the same
`TransactWriteItems` as the transaction:

- `BUDGET#id#P#<periodStart>` holds `spentCents`, `count`, and the `limitCents` in force
  for that period.
- `BUDGET#id#D#<date>` holds daily spending, used for the burn-down chart.

Investment transactions, transfers, and card payments never count toward a budget.

---

### 03-S02 — Create a budget and see all progress

**Story:** As Ezequiel, I want to set a separate limit for each spending area so that I can
keep my university costs and my hobbies from being measured against one another.

A new budget starts with history, because `BudgetService` backfills the current period and
up to 11 earlier ones from `Transactions`.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant BS as BudgetService
    participant BM as BudgetMatcher
    participant Ref as Reference
    participant Tx as Transactions
    participant Agg as Aggregates
    participant BA as BudgetAnalyticsService

    U->>UI: Budgets, "New budget" (BudgetDialog): "University",<br/>tag University (ChipSelect), monthly, $300
    UI->>Web: POST /api/budgets
    Web->>API: POST /api/budgets
    API->>BS: create(userId, budget)
    BS->>Ref: Check categoryIds and tagIds exist (GLOBAL or user, not archived)
    BS->>Ref: Put BUDGET#id (filters, period, limitCents, version 1)
    BS->>Tx: Query SK range for the last 12 periods
    BS->>BM: Keep transactions that match the budget
    BS->>BS: Group by period and day
    BS->>Agg: BatchWrite BUDGET#id#P# and BUDGET#id#D# items
    BS-->>UI: 201 budget
    UI-->>U: Dialog closes, toast "Budget created", the new BudgetCard already shows its history
    U->>UI: Open Budgets
    UI->>Web: GET /api/analytics/budgets
    Web->>API: GET /api/analytics/budgets
    API->>BA: progress(userId, today)
    BA->>Ref: Query BUDGET#
    BA->>Agg: BatchGet the current P# item of each budget
    BA-->>UI: Each budget with spent, limit, remaining, percent, expectedCents, daysLeft
    UI-->>U: One BudgetCard per budget on a two-column grid, budgets over their limit first
    Note over UI,BA: Categories and tags without a budget still have<br/>totals in the MONTH# rollups, just no limit
```

---

### 03-S10 — Change a budget's period

**Story:** As Keisy, I want to set a budget over a week, a month, or a year so that I can
watch the things that vary weekly apart from the ones only a year makes sense of.

A weekly budget starts each week on the user's chosen week-start day. Changing the period
or the filters rebuilds the budget's rollups for the new period boundaries, using the same
backfill as 03-S02.

```mermaid
sequenceDiagram
    autonumber
    actor U as Keisy
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant BS as BudgetService
    participant PC as PeriodCalculator
    participant Ref as Reference
    participant Tx as Transactions
    participant Agg as Aggregates

    U->>UI: BudgetCard "Groceries", Edit (BudgetDialog): monthly to weekly
    UI->>Web: PATCH /api/budgets/id {period WEEKLY, version}
    Web->>API: PATCH /api/budgets/id
    API->>BS: update(userId, id, changes)
    BS->>Ref: Update BUDGET#id (version condition)
    alt Version changed meanwhile
        Ref-->>BS: ConditionalCheckFailed
        BS-->>UI: 409, reload the budget
    else Updated
        BS->>Agg: Query and delete BUDGET#id#P# and #D# items
        BS->>PC: periods(budget, last 12)
        PC-->>BS: Weeks starting on the user's week-start day
        BS->>Tx: Query SK range covering those weeks
        BS->>Agg: BatchWrite new P# and D# items
        BS-->>UI: 200 budget
    end
    Note over BS,Agg: A monthly "Rent" and yearly "Clothing" budget<br/>keep running over the same transactions
```

**The day the week starts.** It is a setting, not part of a budget, so it is changed on the
Settings page and applies to every weekly budget at once.

```mermaid
sequenceDiagram
    autonumber
    actor U as Keisy
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant StS as SettingsService
    participant Ref as Reference
    participant BS as BudgetService

    U->>UI: More, Settings, "Week starts on": Sunday, Save
    UI->>Web: updateSettings({weekStart SUNDAY})
    Web->>API: PUT /api/settings {weekStart}
    API->>API: Validate (Zod): weekStart is a day name, timeZone an IANA zone
    API->>StS: update(userId, changes)
    StS->>Ref: Get PROFILE (defaults when missing)
    StS->>Ref: Put PROFILE (weekStart SUNDAY)
    opt weekStart changed
        StS->>BS: rebuildWeekly(userId)
        loop Each weekly budget
            BS->>BS: backfill(userId, budget), as in the diagram above
        end
    end
    StS-->>UI: 200 settings
    UI-->>U: Toast "Settings saved", weekly budgets now run Sunday to Saturday
```

---

### 03-S11 — Proportion used

**Story:** As Keisy, I want to see what proportion of each budget I have used, including
when I have gone past it, so that I can tell at a glance how far over or under I am.

```mermaid
sequenceDiagram
    autonumber
    actor U as Keisy
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant BA as BudgetAnalyticsService
    participant Agg as Aggregates

    U->>UI: Open Budgets
    UI->>Web: GET /api/analytics/budgets
    Web->>API: GET /api/analytics/budgets
    API->>BA: progress(userId, today)
    BA->>Agg: BatchGet current P# items
    loop Each budget
        BA->>BA: percent = round(spent / limit x 100), no upper bound
        BA->>BA: remaining = limit - spent, overBy = max(0, spent - limit)
        BA->>BA: expected = round(limit x elapsed days / days in period), days left
    end
    BA-->>UI: spent, limit, remaining, percent, overBy, expectedCents, daysLeft
    UI-->>U: BudgetCard "Clothing": Meter filled and marked over, pace tick at the expected<br/>amount, and the figures "$136 of $90 · 151% · $46 over"
    U->>UI: "Details" on the Clothing card (/budgets?open=id)
    UI->>Web: GET /api/analytics/budgets/id?view=burndown
    Web->>API: GET /api/analytics/budgets/id?view=burndown
    API->>BA: burndown(userId, id)
    BA->>Agg: Query BUDGET#id#D# from period start to today
    BA->>BA: cumulative spent per day up to today,<br/>even-pace line = limit x day / days in period for every day of the period
    BA-->>UI: BurndownSeries: dates, cumulativeSpentCents, paceCents, limitCents
    UI-->>U: BurndownSection: LineChart with the spent line ending today,<br/>the even-pace line, and the limit line, each labelled
    Note over UI: Over 100% is shown as a number and the amount over,<br/>never only as a full bar or a colour
```
