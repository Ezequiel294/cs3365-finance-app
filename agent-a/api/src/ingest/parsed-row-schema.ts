import { z } from 'zod';
import { isoDate } from '../../../shared/schemas';
import { CURRENCIES, TRANSACTION_KINDS, type ParsedTransaction } from '../../../shared/types';

const schema = z.object({
  accountId: z.string().min(1).nullable(),
  cardLast4: z.string().regex(/^\d{4}$/).nullable(),
  localDate: isoDate,
  occurredAt: z.string().nullable(),
  direction: z.enum(['out', 'in']),
  kind: z.enum(TRANSACTION_KINDS),
  currency: z.enum(CURRENCIES, { message: 'Unknown currency' }),
  amountMinor: z.number().int().positive(),
  merchantRaw: z.string().min(1).max(200),
  statementRef: z.string().nullable(),
  bankCode: z.string().nullable(),
  authorization: z.string().nullable(),
  source: z.enum(['manual', 'gmail', 'csv']),
  sourceRef: z.string().nullable(),
  line: z.number().int().nullable(),
});

export class ParsedRowValidationError extends Error {}

/** Every parsed row or email is validated before it reaches the save path. */
export const ParsedRowSchema = {
  validate(parsed: unknown): ParsedTransaction {
    const r = schema.safeParse(parsed);
    if (!r.success) {
      const issue = r.error.issues[0];
      throw new ParsedRowValidationError(
        issue ? `${issue.path.join('.') || 'row'}: ${issue.message}` : 'Invalid row',
      );
    }
    return r.data as ParsedTransaction;
  },
};
