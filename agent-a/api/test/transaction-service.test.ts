import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FxUnavailableError } from "../src/http/errors";
import { Keys } from "../src/keys";
import { addAccount, createHarness, TABLES, USER, type Harness } from "./support/harness";

const agg = (h: Harness, sk: string) => h.dynamo.item(TABLES.AGGREGATES_TABLE, Keys.user(USER), sk);

describe("TransactionService", () => {
  let h: Harness;
  beforeEach(async () => {
    h = createHarness();
    await addAccount(h, { currency: "CRC" });
    h.fx.rates["2026-10-14"] = 510.95;
  });
  afterEach(() => h.restore());

  it("saves a manual CRC entry with its original amount, the USD figure, the rate, and every rollup in one write", async () => {
    const txn = await h.services.transactionService().create(USER, {
      accountId: "acc-main",
      kind: "purchase",
      amountMinor: 1_400_000,
      localDate: "2026-10-14",
      merchantRaw: "AUTOMERCADO ESCAZU 042",
      tagIds: ["university"],
    });
    expect(txn).toMatchObject({
      currency: "CRC",
      amountMinor: 1_400_000,
      amountUsdCents: 2740,
      fxRate: 510.95,
      fxDate: "2026-10-14",
      categoryId: "groceries",
      categorizedBy: "global",
      status: "confirmed",
      tagIds: ["university"],
      sources: ["manual"],
      version: 1,
    });
    expect(txn.id.startsWith("20261014-")).toBe(true);
    expect(h.dynamo.transactCalls).toHaveLength(1);
    expect(agg(h, "DAY#2026-10-14#TOTAL")).toMatchObject({ expenseCents: 2740, count: 1 });
    expect(agg(h, "MONTH#2026-10#CAT#groceries")).toMatchObject({ expenseCents: 2740 });
    expect(agg(h, "MONTH#2026-10#TAG#university")).toMatchObject({ expenseCents: 2740 });
  });

  it("defaults the currency to the account's and sends uncategorized spending to review", async () => {
    const txn = await h.services.transactionService().create(USER, { accountId: "acc-main", kind: "purchase", amountMinor: 50_000, localDate: "2026-10-14", tagIds: [] });
    expect(txn.currency).toBe("CRC");
    expect(txn.status).toBe("pending_review");
    const review = await h.services.reviewService().list(USER);
    expect(review.uncategorized.map((t) => t.id)).toEqual([txn.id]);
    expect(review.count).toBe(1);
  });

  it("records income in incomeCents without touching spending (01-S05)", async () => {
    const txn = await h.services.transactionService().create(USER, { accountId: "acc-main", kind: "income", currency: "USD", amountMinor: 125_000, localDate: "2026-10-15", tagIds: [] });
    expect(txn.status).toBe("confirmed");
    expect(agg(h, "MONTH#2026-10#TOTAL")).toMatchObject({ incomeCents: 125_000, expenseCents: 0 });
  });

  it("saves nothing when the exchange rate is unavailable", async () => {
    h.fx.fallback = undefined;
    await expect(
      h.services.transactionService().create(USER, { accountId: "acc-main", kind: "purchase", amountMinor: 100, localDate: "2026-10-16", tagIds: [] }),
    ).rejects.toBeInstanceOf(FxUnavailableError);
    expect(h.dynamo.items(TABLES.TRANSACTIONS_TABLE)).toHaveLength(0);
    expect(h.dynamo.items(TABLES.AGGREGATES_TABLE).filter((i) => String(i.PK).startsWith("USER#"))).toHaveLength(0);
  });

  it("moves totals between categories when the user corrects one, and clears the review flag (02-S02, 02-S06)", async () => {
    const svc = h.services.transactionService();
    const txn = await svc.create(USER, { accountId: "acc-main", kind: "purchase", amountMinor: 1_400_000, localDate: "2026-10-14", merchantRaw: "Spotify", tagIds: [] });
    expect(txn.categoryId).toBe("subscriptions");
    const updated = await svc.update(USER, txn.id, { categoryId: "entertainment", tagIds: ["hobbies"] }, "user");
    expect(updated).toMatchObject({ categoryId: "entertainment", categorizedBy: "user", tagIds: ["hobbies"], version: 2 });
    expect(agg(h, "MONTH#2026-10#CAT#subscriptions")).toMatchObject({ expenseCents: 0, count: 0 });
    expect(agg(h, "MONTH#2026-10#CAT#entertainment")).toMatchObject({ expenseCents: 2740, count: 1 });
    expect(agg(h, "MONTH#2026-10#TOTAL")).toMatchObject({ expenseCents: 2740, count: 1 });
    await expect(svc.update(USER, txn.id, { categoryId: "not-a-category" }, "user")).rejects.toMatchObject({ status: 400 });
  });

  it("re-reads and retries once when the version condition fails, then returns 409", async () => {
    const svc = h.services.transactionService();
    const txn = await svc.create(USER, { accountId: "acc-main", kind: "purchase", amountMinor: 1000, localDate: "2026-10-14", tagIds: [] });
    h.dynamo.failNextTransactions = 1;
    await expect(svc.update(USER, txn.id, { categoryId: "groceries" }, "user")).resolves.toMatchObject({ categoryId: "groceries" });
    h.dynamo.failNextTransactions = 2;
    await expect(svc.update(USER, txn.id, { categoryId: "transport" }, "user")).rejects.toMatchObject({ status: 409 });
  });

  it("merges two records of one purchase: combines sources, keeps the user's category, subtracts the dropped one", async () => {
    const svc = h.services.transactionService();
    const a = await svc.create(USER, { accountId: "acc-main", kind: "purchase", amountMinor: 1_400_000, localDate: "2026-10-14", categoryId: "eating-out", tagIds: [] });
    const b = await svc.save(
      USER,
      { accountId: "acc-main", currency: "CRC", kind: "purchase", amountMinor: 1_400_000, localDate: "2026-10-14", merchantRaw: "AUTOMERCADO", source: "gmail" },
      { categoryId: "groceries", tagIds: [], categorizedBy: "global", status: "confirmed" },
      { possibleDuplicateOf: a.id },
    );
    expect(agg(h, "MONTH#2026-10#TOTAL")).toMatchObject({ expenseCents: 5480, count: 2 });
    const merged = await svc.merge(USER, a.id, b.id);
    expect(merged).toMatchObject({ categoryId: "eating-out", categorizedBy: "user", sources: ["manual", "gmail"], merchantRaw: "AUTOMERCADO" });
    expect(agg(h, "MONTH#2026-10#TOTAL")).toMatchObject({ expenseCents: 2740, count: 1 });
    expect(agg(h, "MONTH#2026-10#CAT#groceries")).toMatchObject({ expenseCents: 0 });
    expect(h.dynamo.items(TABLES.TRANSACTIONS_TABLE)).toHaveLength(1);
  });

  it("lists a month's transactions with the original currency next to the USD amount (05-S01)", async () => {
    const svc = h.services.transactionService();
    await svc.create(USER, { accountId: "acc-main", kind: "purchase", amountMinor: 1_400_000, localDate: "2026-10-14", tagIds: [] });
    await svc.create(USER, { accountId: "acc-main", kind: "purchase", currency: "USD", amountMinor: 1200, localDate: "2026-10-14", tagIds: [] });
    await svc.create(USER, { accountId: "acc-main", kind: "purchase", currency: "USD", amountMinor: 999, localDate: "2026-11-01", tagIds: [] });
    const items = await h.services.transactionQueryService().list(USER, "2026-10-01", "2026-10-31");
    expect(items).toHaveLength(2);
    expect(items.map((t) => [t.currency, t.amountMinor, t.amountUsdCents])).toEqual(
      expect.arrayContaining([
        ["CRC", 1_400_000, 2740],
        ["USD", 1200, 1200],
      ]),
    );
  });
});
