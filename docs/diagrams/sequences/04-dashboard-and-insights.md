# 04 Dashboard and Insights — Sequence Diagrams

Module 04 of the [context model](../context.md). Every view here is read-only and reads
precomputed rollups from `Aggregates` instead of scanning transactions. The views are
rendered by Next.js on the server, which calls `ApiFn` for the data. All amounts are in USD
(see [05](05-multi-currency-and-roles.md)).

Each view is a chart only where a chart answers the story's question, and every chart is
server-rendered SVG with its numbers also available as a table
([class diagram section 2c](../class-diagram.md#2c-charts)). The layout and wording of the
two pages are in [section 2d](../class-diagram.md#2d-pages).

---

### 04-S01a — Open the dashboard

**Story (supporting 04-S01, 04-S03, 04-S06, and 03-S11):** As Daniela, I want to open one
page and see what I spent, where it went, and how my budgets stand so that I can come away
with the answer without operating anything.

The dashboard shows several stories on one screen. This diagram fixes how they share it:
which calls the page makes, which month it opens on, and the order of its sections.

```mermaid
sequenceDiagram
    autonumber
    actor U as Daniela
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant SA as SpendingAnalyticsService
    participant BA as BudgetAnalyticsService
    participant Agg as Aggregates

    U->>UI: Open Dashboard (no month in the URL)
    UI->>Web: Render /dashboard
    Note over UI: Skeleton in the shape of the page while it loads
    Web->>API: GET /api/analytics/spending?period=month&from=2025-12&to=2026-11
    API->>SA: totals(userId, last 12 months)
    SA->>Agg: BatchGet MONTH#yyyy-mm#TOTAL
    SA-->>Web: 12 MonthTotal
    Web->>Web: month = the current month if it has income or spending,<br/>otherwise the latest month that has
    alt No month has any data
        Web-->>UI: One EmptyState "Nothing to show yet":<br/>"Import a statement", "Connect Gmail"
    else Data exists (opens on Nov 2026)
        par Breakdown
            Web->>API: GET /api/analytics/spending?month=2026-11&groupBy=category
            API->>SA: byCategory(userId, 2026-11)
            SA-->>Web: CategoryShare rows
        and Budgets
            Web->>API: GET /api/analytics/budgets
            API->>BA: progress(userId, today)
            BA-->>Web: BudgetProgress rows
        end
        Web-->>UI: DashboardPage, in this order: PageHeader with MonthPicker,<br/>four StatTiles (Spent, Money in, Left over, To review),<br/>SpendingBreakdown (BarList) beside BudgetStrip (Meters),<br/>then "Last 6 months" (ColumnChart)
        UI-->>U: The totals and the headline sentence are readable without scrolling<br/>or operating a control
    end
```

The four tiles and the six-month chart come from the twelve `MonthTotal` rows already
loaded, and the "To review" tile from the count the app shell loaded, so the page makes
three calls. Changing the month with the `MonthPicker` renders `/dashboard?month=2026-10`
and repeats the breakdown call for that month.

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

    U->>UI: Dashboard, step back to Oct 2026 with the MonthPicker
    UI->>Web: Render /dashboard?month=2026-10
    Web->>API: GET /api/analytics/spending?period=month&month=2026-10&groupBy=category
    API->>SA: byCategory(userId, 2026-10)
    SA->>Agg: Query USER#id begins_with MONTH#2026-10#CAT#
    SA->>Ref: BatchGet CAT# names
    SA->>SA: share = expense / total, sort by share,<br/>keep Uncategorized as its own row
    SA-->>Web: Rows with amount and share
    Web-->>UI: SpendingBreakdown: BarList ranked by share, the six largest rows,<br/>the rest summed in one "smaller categories" line, readable without interaction
    UI-->>U: Headline "Eating out took 34% of Oct 2026".<br/>"Other" and "Uncategorized" are muted last rows and never the headline
```

---

### 04-S03 — Breakdown by tag and category

**Story:** As Ezequiel, I want to see spending broken down by tag as well as by category so
that I can find out what my university living actually costs me.

A transaction with two tags counts in both tag totals, so the tag view is ranked bars, never
parts of one whole, and says that tag totals can overlap.

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
    Web-->>UI: SpendingBreakdown, tag view: BarList with one bar per tag<br/>and a marker at the limit of each tag that has a budget
    UI-->>U: "University $286" with its marker at $300,<br/>and the note that tags can add up to more than the total
```

---

### 04-S06 — Income alongside spending

**Story:** As Andrés, I want to see my income alongside my spending over time so that I can
see how lumpy months actually compare against what I spent in them.

Income and expenses are kept in separate fields of each rollup, so both series come from
the same items. The page draws the months from the first one with data to the current one.
With fewer than three months of data it shows the totals and the table and says that
trends need three months, instead of drawing a chart that is mostly empty.

```mermaid
sequenceDiagram
    autonumber
    actor U as Andrés
    participant UI as Browser
    participant Web as Next.js server
    participant API as ApiFn router
    participant SA as SpendingAnalyticsService
    participant Agg as Aggregates

    U->>UI: Dashboard, tab "Money in and out"
    UI->>Web: Render /cashflow?months=12
    Web->>API: GET /api/analytics/spending?period=month&from=2025-11&to=2026-10
    API->>SA: totals(userId, 12 months)
    SA->>Agg: BatchGet MONTH#yyyy-mm#TOTAL for 12 months
    SA->>SA: Months with no item become income 0 and expense 0
    SA-->>Web: 12 points with incomeCents and expenseCents
    Web-->>UI: CashflowPage: three StatTiles (Money in, Spent, Left over),<br/>a ColumnChart with two labelled series, and the month table
    UI-->>U: A month with no income prints "$0" on the baseline, not a gap.<br/>Months before the first data are not drawn
```
