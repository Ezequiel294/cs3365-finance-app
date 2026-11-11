# 04 Dashboard and Insights — Sequence Diagrams

Module 04 of the [context model](../context.md). Every view here is read-only and reads
precomputed rollups from `Aggregates` instead of scanning transactions. The views are
rendered by Next.js on the server, which calls `ApiFn` for the data. All amounts are in USD
(see [05](05-multi-currency-and-roles.md)).

---

### 04-S01 — Where last month's money went

**Story:** As Daniela, I want to see where last month's money went so that I can learn
something about my spending without having recorded any of it.

```mermaid
sequenceDiagram
    autonumber
    actor U as Daniela
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant SA as SpendingAnalyticsService
    participant Agg as Aggregates
    participant Ref as Reference

    U->>UI: Open dashboard
    UI->>Web: Render /dashboard
    Web->>API: GET /api/analytics/spending?period=month&month=2026-10&groupBy=category
    API->>SA: byCategory(userId, 2026-10)
    SA->>Agg: Query USER#id begins_with MONTH#2026-10#CAT#
    SA->>Ref: BatchGet CAT# names
    SA->>SA: share = expense / total, sort by share,<br/>keep Uncategorized as its own row
    SA-->>Web: Rows with amount and share
    Web-->>UI: Ranked bar list, readable without interaction
    UI-->>U: "Eating out took 34% of October"
```

---

### 04-S03 — Breakdown by tag and category

**Story:** As Ezequiel, I want to see spending broken down by tag as well as by category so
that I can find out what my university living actually costs me.

A transaction with two tags counts in both tag totals, so the tag view is a list rather than
a pie chart and says that tag totals can overlap.

```mermaid
sequenceDiagram
    autonumber
    actor U as Ezequiel
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant SA as SpendingAnalyticsService
    participant BA as BudgetAnalyticsService
    participant Agg as Aggregates

    U->>UI: Switch the dashboard toggle from Category to Tag
    UI->>Web: Render /dashboard?groupBy=tag
    Web->>API: GET /api/analytics/spending?month=2026-10&groupBy=tag
    API->>SA: byTag(userId, 2026-10)
    SA->>Agg: Query MONTH#2026-10#TAG#
    SA-->>Web: Tag totals
    Web->>API: GET /api/analytics/budgets
    API->>BA: progress(userId, today)
    BA-->>Web: Budgets that target each tag, with limits
    Web-->>UI: Tag list, limit shown next to each tag that has a budget
    UI-->>U: "University $286 of $300", note that tag totals can overlap
```

---

### 04-S06 — Income alongside spending

**Story:** As Andrés, I want to see my income alongside my spending over time so that I can
see how lumpy months actually compare against what I spent in them.

Income and expenses are kept in separate fields of each rollup, so both series come from
the same items.

```mermaid
sequenceDiagram
    autonumber
    actor U as Andrés
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant SA as SpendingAnalyticsService
    participant Agg as Aggregates

    U->>UI: Open "Money in and out"
    UI->>Web: Render /cashflow?months=12
    Web->>API: GET /api/analytics/spending?period=month&from=2025-11&to=2026-10
    API->>SA: totals(userId, 12 months)
    SA->>Agg: BatchGet MONTH#yyyy-mm#TOTAL for 12 months
    SA->>SA: Months with no item become income 0 and expense 0
    SA-->>Web: 12 points with incomeCents and expenseCents
    Web-->>UI: Two labelled series on one timeline
    UI-->>U: Months with no income shown as $0, not as gaps
```
