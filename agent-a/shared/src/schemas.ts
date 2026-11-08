import { z } from "zod";
import { BudgetPeriod, Currency, InvestmentType, TransactionKind, WeekStart } from "./enums";

/** `yyyy-mm-dd` */
export const LocalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date as yyyy-mm-dd")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "must be a real date");

/** `yyyy-mm` */
export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be a month as yyyy-mm");

const Id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/, "must be an ID");
const MinorAmount = z.number().int().positive().max(1_000_000_000_000);
const Cents = z.number().int().nonnegative().max(1_000_000_000_000);
const IdList = z.array(Id).max(20);

export const MERCHANT_KEY_PATTERN = /^[a-z0-9-]{1,64}$/;
export const MerchantKey = z.string().regex(MERCHANT_KEY_PATTERN, "must be a normalized merchant key");

export const TICKER_PATTERN = /^[A-Z0-9.\-/]{1,20}$/;
export const Ticker = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().regex(TICKER_PATTERN, "must be a ticker such as VOO or BTC/USD"));

// ---------- Transactions ----------

export const NewTransaction = z.object({
  accountId: Id,
  kind: TransactionKind.default("purchase"),
  amountMinor: MinorAmount,
  currency: Currency.optional(),
  localDate: LocalDate,
  merchantRaw: z.string().trim().max(200).optional(),
  categoryId: Id.optional(),
  tagIds: IdList.default([]),
  note: z.string().trim().max(500).optional(),
});
export type NewTransaction = z.infer<typeof NewTransaction>;

export const TransactionChanges = z
  .object({
    kind: TransactionKind.optional(),
    amountMinor: MinorAmount.optional(),
    currency: Currency.optional(),
    merchantRaw: z.string().trim().max(200).optional(),
    categoryId: Id.nullable().optional(),
    tagIds: IdList.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), "at least one change is required");
export type TransactionChanges = z.infer<typeof TransactionChanges>;

export const TransactionsQuery = z.object({
  from: LocalDate,
  to: LocalDate,
  accountId: Id.optional(),
  categoryId: Id.optional(),
  tagId: Id.optional(),
});
export type TransactionsQuery = z.infer<typeof TransactionsQuery>;

// ---------- Imports ----------

export const NewImport = z.object({
  accountId: Id,
  fileName: z.string().trim().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "must be a hex SHA-256"),
});
export type NewImport = z.infer<typeof NewImport>;

// ---------- Review and rules ----------

export const MergeDuplicate = z.object({ keepId: Id, dropId: Id }).refine((m) => m.keepId !== m.dropId, "keepId and dropId must differ");
export type MergeDuplicate = z.infer<typeof MergeDuplicate>;

export const DismissDuplicate = z.object({ id: Id });
export type DismissDuplicate = z.infer<typeof DismissDuplicate>;

export const RuleInput = z.object({
  categoryId: Id,
  tagIds: IdList.default([]),
});
export type RuleInput = z.infer<typeof RuleInput>;

// ---------- Budgets ----------

const budgetFields = {
  name: z.string().trim().min(1).max(80),
  categoryIds: IdList.default([]),
  tagIds: IdList.default([]),
  period: BudgetPeriod,
  limitCents: z.number().int().positive().max(1_000_000_000_000),
  startDate: LocalDate.optional(),
  endDate: LocalDate.optional(),
};

function customRangeOk(b: { period?: string; startDate?: string; endDate?: string }): boolean {
  if (b.period !== "CUSTOM") return true;
  return !!b.startDate && !!b.endDate && b.startDate <= b.endDate;
}

export const NewBudget = z
  .object(budgetFields)
  .refine((b) => b.categoryIds.length + b.tagIds.length > 0, "a budget needs at least one category or tag")
  .refine(customRangeOk, "a custom budget needs startDate and endDate, with startDate first");
export type NewBudget = z.infer<typeof NewBudget>;

export const BudgetChanges = z
  .object({
    name: budgetFields.name.optional(),
    categoryIds: IdList.optional(),
    tagIds: IdList.optional(),
    period: BudgetPeriod.optional(),
    limitCents: budgetFields.limitCents.optional(),
    startDate: LocalDate.optional(),
    endDate: LocalDate.optional(),
    version: z.number().int().positive(),
  })
  .refine(customRangeOk, "a custom budget needs startDate and endDate, with startDate first");
export type BudgetChanges = z.infer<typeof BudgetChanges>;

export const SpendingQuery = z.object({
  period: z.literal("month").default("month"),
  month: Month.optional(),
  from: Month.optional(),
  to: Month.optional(),
  groupBy: z.enum(["category", "tag"]).default("category"),
});
export type SpendingQuery = z.infer<typeof SpendingQuery>;

// ---------- Investments ----------

export const NewInvestmentTransaction = z
  .object({
    brokerId: Id,
    type: InvestmentType,
    localDate: LocalDate,
    ticker: Ticker.optional(),
    quantityMicro: z.number().int().positive().max(1_000_000_000_000_000).optional(),
    grossCents: Cents.optional(),
    amountCents: Cents.optional(),
    commissionCents: Cents.default(0),
    name: z.string().trim().max(120).optional(),
  })
  .superRefine((t, ctx) => {
    if (t.type === "BUY" || t.type === "SELL") {
      if (!t.ticker) ctx.addIssue({ code: "custom", path: ["ticker"], message: "a buy or sell needs a ticker" });
      if (!t.quantityMicro) ctx.addIssue({ code: "custom", path: ["quantityMicro"], message: "a buy or sell needs a quantity" });
      if (t.grossCents === undefined) ctx.addIssue({ code: "custom", path: ["grossCents"], message: "a buy or sell needs the gross trade value" });
    } else if (t.amountCents === undefined || t.amountCents <= 0) {
      ctx.addIssue({ code: "custom", path: ["amountCents"], message: "a deposit or withdrawal needs an amount" });
    }
  });
export type NewInvestmentTransaction = z.infer<typeof NewInvestmentTransaction>;

export const InvestmentChanges = z
  .object({
    quantityMicro: z.number().int().positive().max(1_000_000_000_000_000).optional(),
    grossCents: Cents.optional(),
    amountCents: Cents.optional(),
    commissionCents: Cents.optional(),
    name: z.string().trim().max(120).optional(),
    version: z.number().int().positive(),
  })
  .refine((c) => Object.entries(c).some(([k, v]) => k !== "version" && v !== undefined), "at least one change is required");
export type InvestmentChanges = z.infer<typeof InvestmentChanges>;

export const BrokerRule = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  flatCents: z.number().int().nonnegative().max(100_000_000),
  percentBps: z.number().int().nonnegative().max(10_000),
  /** 0 creates the broker; otherwise the version last read. */
  version: z.number().int().nonnegative(),
});
export type BrokerRule = z.infer<typeof BrokerRule>;

// ---------- Reference data (supporting routes) ----------

export const NewAccount = z.object({
  name: z.string().trim().min(1).max(80),
  bank: z.string().trim().min(1).max(80),
  type: z.enum(["checking", "savings", "credit_card", "cash", "other"]),
  currency: Currency,
  last4: z.string().regex(/^\d{4}$/, "must be the last 4 digits").optional(),
});
export type NewAccount = z.infer<typeof NewAccount>;

export const NewLabel = z.object({ name: z.string().trim().min(1).max(60) });
export type NewLabel = z.infer<typeof NewLabel>;

export const SettingsInput = z.object({
  timeZone: z.string().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "must be an IANA time zone"),
  weekStart: WeekStart,
});
export type SettingsInput = z.infer<typeof SettingsInput>;
