import { CurrencySchema, KindSchema, LocalDate, type Currency, type TransactionKind, type TransactionSource } from '@finance/shared';
import { z } from 'zod';

/** What a template produces, before conversion, duplicate matching, and categorization. */
export interface ParsedTransaction {
  accountId: string;
  cardLast4?: string | null;
  localDate: string;
  occurredAt: string | null;
  direction: 'out' | 'in';
  kind: TransactionKind;
  currency: Currency;
  amountMinor: number;
  merchantRaw: string;
  statementRef?: string | null;
  bankCode?: string | null;
  authorization?: string | null;
  source: TransactionSource;
  sourceRef?: string | null;
  line?: number;
}

const Schema = z.object({
  accountId: z.string().min(1),
  cardLast4: z.string().regex(/^\d{4}$/).nullish(),
  localDate: LocalDate,
  occurredAt: z.string().nullable(),
  direction: z.enum(['out', 'in']),
  kind: KindSchema,
  currency: CurrencySchema,
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  merchantRaw: z.string().min(1).max(200),
  statementRef: z.string().max(60).nullish(),
  bankCode: z.string().max(20).nullish(),
  authorization: z.string().max(40).nullish(),
  source: z.enum(['manual', 'gmail', 'csv']),
  sourceRef: z.string().max(300).nullish(),
  line: z.number().int().positive().optional(),
});

/** Zod check of every parsed row or email before it is saved. */
export class ParsedRowSchema {
  /** Returns the row, or throws a `RowParseError` with the first problem in words. */
  static validate(parsed: ParsedTransaction): ParsedTransaction {
    const result = Schema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join('.') || 'row';
      throw new RowParseError(field === 'currency' ? 'Unknown currency' : `Invalid ${field}: ${issue.message}`);
    }
    return parsed;
  }
}

/** A single row that cannot be read; the other rows still import. */
export class RowParseError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'RowParseError';
  }
}
