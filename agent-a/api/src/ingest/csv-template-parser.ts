import type { Account, ParsedTransaction } from "@finance/shared";
import { ValidationError } from "../http/errors";
import { foldText } from "./csv";
import type { CsvTemplate } from "./templates/types";
import { parseAmount, parseDate } from "./values";

/** Generic CSV row parser: it knows nothing about any bank and only follows the template. */
export class CsvTemplateParser {
  parseRow(row: string[], template: CsvTemplate, account: Pick<Account, "currency" | "last4">): ParsedTransaction {
    const index = new Map(template.headerRow.map((h, i) => [foldText(h), i]));
    const cell = (column: string | undefined): string => {
      if (!column) return "";
      const i = index.get(foldText(column));
      return i === undefined ? "" : (row[i] ?? "").trim();
    };

    const dateText = cell(template.columns.date);
    const localDate = parseDate(dateText, template.dateFormat);
    if (!localDate) throw new ValidationError(`unreadable date "${dateText.slice(0, 20)}"`);

    let amountMinor: number;
    let isCredit: boolean;
    if (template.columns.amount) {
      const parsed = parseAmount(cell(template.columns.amount), template.numberFormat);
      if (!parsed || parsed.minor === 0) throw new ValidationError("unreadable amount");
      amountMinor = parsed.minor;
      isCredit = template.debitIsNegative ? !parsed.negative : parsed.negative;
    } else {
      const debit = parseAmount(cell(template.columns.debit), template.numberFormat);
      const credit = parseAmount(cell(template.columns.credit), template.numberFormat);
      const hasDebit = !!debit && debit.minor > 0;
      const hasCredit = !!credit && credit.minor > 0;
      if (hasDebit === hasCredit) throw new ValidationError(hasDebit ? "row has both a debit and a credit" : "unreadable amount");
      amountMinor = hasDebit ? debit!.minor : credit!.minor;
      isCredit = hasCredit;
    }

    let currency: ParsedTransaction["currency"];
    if (template.currencySource === "account") {
      currency = account.currency;
    } else {
      const raw = cell(template.columns.currency).toUpperCase();
      const aliases: Record<string, "CRC" | "USD"> = { CRC: "CRC", "₡": "CRC", COL: "CRC", COLONES: "CRC", USD: "USD", $: "USD", DOLARES: "USD" };
      currency = aliases[raw];
      if (!currency) throw new ValidationError("unknown currency");
    }

    const description = cell(template.columns.description);
    const reference = cell(template.columns.reference);
    return {
      accountLast4: account.last4,
      localDate,
      kind: isCredit ? template.creditKind : template.debitKind,
      currency,
      amountMinor,
      merchantRaw: description || undefined,
      statementRef: reference || undefined,
      source: "csv",
    };
  }
}
