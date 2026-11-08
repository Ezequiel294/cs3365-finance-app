import { Currency, LocalDate, TransactionKind, TransactionSource, type ParsedTransaction } from "@finance/shared";
import { z } from "zod";
import { ValidationError } from "../http/errors";

const schema = z.object({
  accountLast4: z.string().regex(/^\d{4}$/).optional(),
  localDate: LocalDate,
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  kind: TransactionKind,
  currency: Currency.optional(),
  amountMinor: z.number().int().positive("amount must be greater than zero"),
  merchantRaw: z.string().trim().max(200).optional(),
  statementRef: z.string().trim().max(100).optional(),
  source: TransactionSource,
  sourceRef: z.string().max(300).optional(),
});

/** Validates what a template produced before it is converted, matched, and saved. */
export class ParsedRowSchema {
  validate(parsed: unknown): ParsedTransaction {
    const result = schema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join(".") || "row";
      throw new ValidationError(`${field}: ${issue.message}`);
    }
    return result.data;
  }
}
