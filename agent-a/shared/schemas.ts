import { z } from 'zod';
import {
  ASSET_CLASSES,
  BANKS,
  BUDGET_PERIODS,
  CURRENCIES,
  TRANSACTION_KINDS,
  WEEK_DAYS,
} from './types';

/**
 * Shared Zod request schemas (class diagram section 3a, RequestSchemas). The Next.js
 * Server Actions and the API routers validate with the same objects.
 */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), 'Not a real date');

export const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');

const id = z.string().trim().min(1).max(80);
const positiveCents = z.number().int().positive().max(1_000_000_000_00);
const nonNegativeCents = z.number().int().min(0).max(1_000_000_000_00);

export const Ticker = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((t) => t.toUpperCase().replace(/\//g, '-'))
  .pipe(z.string().regex(/^[A-Z0-9^][A-Z0-9.\-=^]*$/, 'Use the symbol as shown on Yahoo Finance'));

export const Iban = z
  .string()
  .transform((s) => s.replace(/\s+/g, '').toUpperCase())
  .pipe(z.string().regex(/^CR\d{20}$/, 'A Costa Rican IBAN is CR followed by 20 digits'));

export const CardLast4 = z.string().trim().regex(/^\d{4}$/, 'Each card is exactly four digits');

export const NewTransaction = z.object({
  accountId: id,
  kind: z.enum(TRANSACTION_KINDS),
  amountMinor: positiveCents,
  currency: z.enum(CURRENCIES),
  localDate: isoDate,
  merchantRaw: z.string().trim().min(1, 'Enter a merchant or description').max(120),
  categoryId: id.nullable().optional(),
  tagIds: z.array(id).max(20).optional(),
});
export type NewTransaction = z.infer<typeof NewTransaction>;

export const TransactionChanges = z
  .object({
    categoryId: id.nullable().optional(),
    tagIds: z.array(id).max(20).optional(),
    kind: z.enum(TRANSACTION_KINDS).optional(),
  })
  .refine((c) => c.categoryId !== undefined || c.tagIds !== undefined || c.kind !== undefined, {
    message: 'Nothing to change',
  });
export type TransactionChanges = z.infer<typeof TransactionChanges>;

export const NewAccount = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  bank: z.enum(BANKS),
  currency: z.enum(CURRENCIES),
  type: z.string().trim().max(30).optional(),
  iban: Iban.nullable().optional(),
  cardLast4s: z.array(CardLast4).max(10).default([]),
});
export type NewAccount = z.infer<typeof NewAccount>;

export const AccountChanges = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  bank: z.enum(BANKS).optional(),
  currency: z.enum(CURRENCIES).optional(),
  type: z.string().trim().max(30).optional(),
  iban: Iban.nullable().optional(),
  cardLast4s: z.array(CardLast4).max(10).optional(),
  version: z.number().int().positive(),
});
export type AccountChanges = z.infer<typeof AccountChanges>;

export const MAX_IMPORT_BYTES = 1024 * 1024;

export const NewImport = z.object({
  accountId: id,
  fileName: z.string().trim().max(200).optional(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lower-case hex characters'),
  size: z.number().int().min(1).max(MAX_IMPORT_BYTES, 'The file is over 1 MB'),
});
export type NewImport = z.infer<typeof NewImport>;

export const RuleInput = z.object({
  categoryId: id.nullable().optional(),
  tagIds: z.array(id).max(20).optional(),
  kind: z.enum(TRANSACTION_KINDS).nullable().optional(),
});
export type RuleInput = z.infer<typeof RuleInput>;

const budgetBase = {
  name: z.string().trim().min(1, 'Enter a name').max(60),
  categoryIds: z.array(id).max(30).default([]),
  tagIds: z.array(id).max(30).default([]),
  period: z.enum(BUDGET_PERIODS),
  limitCents: positiveCents,
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
};

export const NewBudget = z
  .object(budgetBase)
  .refine((b) => b.period !== 'CUSTOM' || (b.startDate && b.endDate && b.startDate <= b.endDate), {
    message: 'A custom range needs a start and an end date',
    path: ['startDate'],
  });
export type NewBudget = z.infer<typeof NewBudget>;

export const BudgetChanges = z.object({
  name: budgetBase.name.optional(),
  categoryIds: z.array(id).max(30).optional(),
  tagIds: z.array(id).max(30).optional(),
  period: z.enum(BUDGET_PERIODS).optional(),
  limitCents: positiveCents.optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  version: z.number().int().positive(),
});
export type BudgetChanges = z.infer<typeof BudgetChanges>;

export const FeeInput = z.object({
  flatCents: nonNegativeCents.default(0),
  percentBps: z.number().int().min(0).max(9999).default(0),
});
export const AssetFeesInput = z.object({ security: FeeInput, crypto: FeeInput });
export const FeeScheduleInput = z.object({
  deposit: FeeInput,
  withdrawal: FeeInput,
  buy: AssetFeesInput,
  sell: AssetFeesInput,
});

export const NewBroker = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40),
  fees: FeeScheduleInput,
});
export type NewBroker = z.infer<typeof NewBroker>;

export const BrokerFees = z.object({
  fees: FeeScheduleInput,
  version: z.number().int().positive(),
});
export type BrokerFees = z.infer<typeof BrokerFees>;

const investmentCommon = {
  brokerId: id,
  localDate: isoDate,
  name: z.string().trim().max(80).nullable().optional(),
  commissionCents: nonNegativeCents.optional(),
};

export const NewInvestmentTransaction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DEPOSIT'), amountCents: positiveCents, ...investmentCommon }),
  z.object({ type: z.literal('WITHDRAWAL'), amountCents: positiveCents, ...investmentCommon }),
  z.object({
    type: z.literal('BUY'),
    ticker: Ticker,
    assetClass: z.enum(ASSET_CLASSES),
    quantityMicro: z.number().int().positive(),
    grossCents: positiveCents,
    ...investmentCommon,
  }),
  z.object({
    type: z.literal('SELL'),
    ticker: Ticker,
    assetClass: z.enum(ASSET_CLASSES),
    quantityMicro: z.number().int().positive(),
    grossCents: positiveCents,
    ...investmentCommon,
  }),
]);
export type NewInvestmentTransaction = z.infer<typeof NewInvestmentTransaction>;

export const InvestmentChanges = z.object({
  version: z.number().int().positive(),
  quantityMicro: z.number().int().positive().optional(),
  grossCents: positiveCents.optional(),
  amountCents: positiveCents.optional(),
  /** A number stores a manual fee; null asks the API to derive it again from the schedule. */
  commissionCents: nonNegativeCents.nullable().optional(),
  name: z.string().trim().max(80).nullable().optional(),
});
export type InvestmentChanges = z.infer<typeof InvestmentChanges>;

export const NewCatalogEntry = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(40, 'Use at most 40 characters'),
});
export type NewCatalogEntry = z.infer<typeof NewCatalogEntry>;

export function isIanaTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return /^[A-Za-z_]+(\/[A-Za-z0-9_\-+]+)*$/.test(tz);
  } catch {
    return false;
  }
}

export const SettingsChanges = z.object({
  weekStart: z.enum(WEEK_DAYS).optional(),
  timeZone: z
    .string()
    .trim()
    .refine(isIanaTimeZone, 'Use a time zone name such as America/Costa_Rica')
    .optional(),
});
export type SettingsChanges = z.infer<typeof SettingsChanges>;

export const MergeDuplicate = z.object({ keepId: id, dropId: id });
export const DismissDuplicate = z.object({ id });

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
  NewCatalogEntry,
  SettingsChanges,
};

/** Turn a ZodError into `{field: message}` for the form (Server Action result `fields`). */
export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
