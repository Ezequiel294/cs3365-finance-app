import type { ParsedTransaction } from "@finance/shared";
import { localDateIn } from "../clock";
import { ValidationError } from "../http/errors";
import type { ParsedMime } from "./mime";
import type { EmailTemplate } from "./templates/types";
import { parseAmount, parseDate } from "./values";

/** Generic alert-email parser: it applies the template's field patterns to the message text. */
export class EmailTemplateParser {
  parse(mime: ParsedMime, template: EmailTemplate, timeZone = "America/Costa_Rica"): ParsedTransaction {
    const text = mime.text;
    const capture = (pattern: RegExp | undefined): string | undefined => {
      if (!pattern) return undefined;
      const m = pattern.exec(text);
      return m?.[1]?.trim() || undefined;
    };

    const amountText = capture(template.fieldPatterns.amount);
    const amount = amountText ? parseAmount(amountText, template.numberFormat) : null;
    if (!amount || amount.minor === 0) throw new ValidationError("no amount found in the email");

    const currencyText = capture(template.fieldPatterns.currency);
    const currency = currencyText ? template.currencyAliases[currencyText.toUpperCase()] ?? template.currencyAliases[currencyText] : template.defaultCurrency;
    if (!currency) throw new ValidationError("unknown currency");

    const dateText = capture(template.fieldPatterns.date);
    let localDate = dateText ? parseDate(dateText, template.dateFormat) : null;
    if (!localDate && mime.date) localDate = localDateIn(mime.date, timeZone);
    if (!localDate) throw new ValidationError("no date found in the email");

    return {
      accountLast4: capture(template.fieldPatterns.last4),
      localDate,
      occurredAt: mime.date?.toISOString(),
      kind: template.kind,
      currency,
      amountMinor: amount.minor,
      merchantRaw: capture(template.fieldPatterns.merchant)?.slice(0, 200),
      statementRef: capture(template.fieldPatterns.reference),
      source: "gmail",
      sourceRef: mime.messageId,
    };
  }
}
