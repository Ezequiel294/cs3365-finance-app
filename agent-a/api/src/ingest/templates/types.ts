import type { Currency, TransactionKind } from "@finance/shared";

export type NumberFormat = "en" | "es"; // en: 1,234.56   es: 1.234,56
export type DateFormat = "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd" | "dd-MM-yyyy";

/** Shared fields of every bank template. Templates are declarative config; the parsers interpret them. */
export interface Template {
  id: string;
  bank: string;
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
  /** True for templates written without a real bank sample. */
  placeholder?: boolean;
}

export interface CsvColumns {
  date: string;
  description?: string;
  /** One signed amount column, or separate debit and credit columns. */
  amount?: string;
  debit?: string;
  credit?: string;
  currency?: string;
  reference?: string;
}

export interface CsvTemplate extends Template {
  headerRow: string[];
  encoding: "utf-8" | "latin1";
  delimiter: "," | ";" | "\t";
  columns: CsvColumns;
  /** `column`: each row names its currency; `account`: every row is in the account's currency. */
  currencySource: "column" | "account";
  /** For a single amount column: whether money out is written as a negative number. */
  debitIsNegative?: boolean;
  debitKind: TransactionKind;
  creditKind: TransactionKind;
}

export interface EmailFieldPatterns {
  /** Each pattern's first capture group is the value. */
  amount: RegExp;
  currency?: RegExp;
  merchant?: RegExp;
  date?: RegExp;
  time?: RegExp;
  last4?: RegExp;
  reference?: RegExp;
}

export interface EmailTemplate extends Template {
  senders: string[];
  subject: RegExp;
  fieldPatterns: EmailFieldPatterns;
  kind: TransactionKind;
  /** Maps the text captured by `currency` (e.g. "₡", "CRC", "colones") to a currency code. */
  currencyAliases: Record<string, Currency>;
  /** Currency used when the email does not state one. */
  defaultCurrency?: Currency;
}
