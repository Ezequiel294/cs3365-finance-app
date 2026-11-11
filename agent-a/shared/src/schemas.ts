import { z } from 'zod';
import {
  ASSET_CLASSES,
  BANKS,
  BUDGET_PERIODS,
  CURRENCIES,
  TRANSACTION_KINDS,
  WEEK_DAYS,
} from './types';

/** A real calendar date in `yyyy-mm-dd`. */
export const LocalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as yyyy-mm-dd')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real calendar date');

export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected a month as yyyy-mm');

const Id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_\-.~]+$/, 'Invalid id');
const PositiveCents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const NonNegativeCents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const CurrencySchema = z.enum(CURRENCIES);
export const KindSchema = z.enum(TRANSACTION_KINDS);
export const BankSchema = z.enum(BANKS);

/** `CR` plus 20 digits; spaces removed and upper-cased before checking. */
export const IbanSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, '').toUpperCase())
  .pipe(z.string().regex(/^CR\d{20}$/, 'IBAN must be CR followed by 20 digits'));

const CardLast4 = z.string().regex(/^\d{4}$/, 'Each card must be exactly four digits');

export const NewTransaction = z.object({
  accountId: Id,
  kind: KindSchema,
  localDate: LocalDate,
  occurredAt: z.string().datetime({ offset: true }).nullish(),
  currency: CurrencySchema,
  amountMinor: PositiveCents,
  merchantRaw: z.string().trim().min(1).max(140),
  categoryId: Id.nullish(),
  tagIds: z.array(Id).max(20).default([]),
  note: z.string().max(500).nullish(),
});
export type NewTransactionInput = z.infer<typeof NewTransaction>;

export const TransactionChanges = z
  .object({
    categoryId: Id.nullish(),
    tagIds: z.array(Id).max(20).optional(),
    kind: KindSchema.optional(),
    note: z.string().max(500).nullish(),
    version: z.number().int().positive().optional(),
  })
  .refine((c) => c.categoryId !== undefined || c.tagIds !== undefined || c.kind !== undefined || c.note !== undefined, {
    message: 'Nothing to change',
  });
export type TransactionChangesInput = z.infer<typeof TransactionChanges>;

export const NewAccount = z.object({
  name: z.string().trim().min(1).max(60),
  bank: BankSchema,
  currency: CurrencySchema,
  type: z.string().trim().min(1).max(30).default('bank'),
  iban: z.union([IbanSchema, z.literal('').transform(() => null), z.null()]).optional(),
  cardLast4s: z.array(CardLast4).max(10).default([]),
});
export type NewAccountInput = z.infer<typeof NewAccount>;

export const AccountChanges = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  type: z.string().trim().min(1).max(30).optional(),
  iban: z.union([IbanSchema, z.literal('').transform(() => null), z.null()]).optional(),
  cardLast4s: z.array(CardLast4).max(10).optional(),
  version: z.number().int().positive(),
});
export type AccountChangesInput = z.infer<typeof AccountChanges>;

export const MAX_IMPORT_BYTES = 1024 * 1024;

export const NewImport = z.object({
  accountId: Id,
  fileName: z.string().trim().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, 'Expected a hex SHA-256'),
  size: z.number().int().min(1).max(MAX_IMPORT_BYTES, 'The file is larger than 1 MiB'),
});
export type NewImportInput = z.infer<typeof NewImport>;

export const RuleInput = z.object({
  categoryId: Id.nullish(),
  tagIds: z.array(Id).max(20).default([]),
  kind: KindSchema.nullish(),
});
export type RuleInputType = z.infer<typeof RuleInput>;

const BudgetBase = z.object({
  name: z.string().trim().min(1).max(60),
  categoryIds: z.array(Id).max(50).default([]),
  tagIds: z.array(Id).max(50).default([]),
  period: z.enum(BUDGET_PERIODS),
  limitCents: PositiveCents,
  startDate: LocalDate.nullish(),
  endDate: LocalDate.nullish(),
});

export const NewBudget = BudgetBase.refine(
  (b) => b.period !== 'CUSTOM' || (b.startDate && b.endDate && b.startDate <= b.endDate),
  { message: 'A custom budget needs a start date on or before its end date', path: ['startDate'] },
);
export type NewBudgetInput = z.infer<typeof NewBudget>;

export const BudgetChanges = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  categoryIds: z.array(Id).max(50).optional(),
  tagIds: z.array(Id).max(50).optional(),
  period: z.enum(BUDGET_PERIODS).optional(),
  limitCents: PositiveCents.optional(),
  startDate: LocalDate.nullish(),
  endDate: LocalDate.nullish(),
  version: z.number().int().positive(),
});
export type BudgetChangesInput = z.infer<typeof BudgetChanges>;

// ---------- Investments ----------

export const FeeSchema = z.object({
  flatCents: NonNegativeCents.default(0),
  percentBps: z.number().int().min(0).max(9999).default(0),
});

const AssetFeesSchema = z.object({ security: FeeSchema, crypto: FeeSchema });

export const FeeScheduleSchema = z.object({
  deposit: FeeSchema,
  withdrawal: FeeSchema,
  buy: AssetFeesSchema,
  sell: AssetFeesSchema,
});

export const NewBroker = z.object({
  name: z.string().trim().min(1).max(60),
  fees: FeeScheduleSchema,
});
export type NewBrokerInput = z.infer<typeof NewBroker>;

export const BrokerFees = z.object({
  fees: FeeScheduleSchema,
  version: z.number().int().positive(),
});
export type BrokerFeesInput = z.infer<typeof BrokerFees>;

/** Ticker as Yahoo Finance shows it, upper-cased; `/` becomes `-` (BTC/USD → BTC-USD). */
export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/\//g, '-');
}

export const TickerSchema = z
  .string()
  .transform(normalizeTicker)
  .pipe(z.string().regex(/^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/, 'Not a valid ticker'));

const InvestmentCommon = {
  brokerId: Id,
  localDate: LocalDate,
  name: z.string().trim().max(120).nullish(),
  commissionCents: NonNegativeCents.optional(),
};

export const NewInvestmentTransaction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DEPOSIT'), ...InvestmentCommon, amountCents: PositiveCents }),
  z.object({ type: z.literal('WITHDRAWAL'), ...InvestmentCommon, amountCents: PositiveCents }),
  z.object({
    type: z.literal('BUY'),
    ...InvestmentCommon,
    ticker: TickerSchema,
    assetClass: z.enum(ASSET_CLASSES),
    quantityMicro: PositiveCents,
    grossCents: PositiveCents,
  }),
  z.object({
    type: z.literal('SELL'),
    ...InvestmentCommon,
    ticker: TickerSchema,
    assetClass: z.enum(ASSET_CLASSES).optional(),
    quantityMicro: PositiveCents,
    grossCents: PositiveCents,
  }),
]);
export type NewInvestmentInput = z.infer<typeof NewInvestmentTransaction>;

export const InvestmentChanges = z
  .object({
    amountCents: PositiveCents.optional(),
    quantityMicro: PositiveCents.optional(),
    grossCents: PositiveCents.optional(),
    commissionCents: NonNegativeCents.optional(),
    name: z.string().trim().max(120).nullish(),
    version: z.number().int().positive(),
  })
  .refine(
    (c) =>
      c.amountCents !== undefined ||
      c.quantityMicro !== undefined ||
      c.grossCents !== undefined ||
      c.commissionCents !== undefined ||
      c.name !== undefined,
    { message: 'Nothing to change' },
  );
export type InvestmentChangesInput = z.infer<typeof InvestmentChanges>;

// ---------- Small request bodies ----------

export const MergeInput = z.object({ keepId: Id, dropId: Id });
export const DismissInput = z.object({ id: Id });
export const NameInput = z.object({ name: z.string().trim().min(1).max(60) });
export const SettingsInput = z.object({
  timeZone: z.string().min(1).max(60).optional(),
  weekStart: z.enum(WEEK_DAYS).optional(),
});

/** Every request schema, named as in the class diagram (`RequestSchemas`). */
export const RequestSchemas = {
  NewTransaction,
  TransactionChanges,
  NewAccount,
  AccountChanges,
  NewImport,
  RuleInput,
  NewBudget,
  BudgetChanges,
  NewInvestmentTransaction,
  InvestmentChanges,
  NewBroker,
  BrokerFees,
};
