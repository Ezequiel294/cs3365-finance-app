import type { Bank, Direction, TransactionKind } from '../../../../shared/types';

export interface Template {
  id: string;
  bank: Bank;
}

export interface KindRule {
  direction: Direction;
  pattern: RegExp;
  when?: 'ownAccount' | 'holderName';
  kind: TransactionKind;
}

export interface PreambleSpec {
  /** First normalized fields of line 1 that identify the file. */
  header: string[];
  /** StatementMeta field → normalized column name of line 1. */
  fields: { holderName: string; iban: string; currency: string; statementDate: string };
}

export interface CsvColumns {
  date: string;
  ref: string;
  code?: string;
  description: string;
  debit: string;
  credit: string;
}

export interface CsvTemplate extends Template {
  layout: 'table' | 'sectioned';
  delimiter: string;
  header: string[];
  preamble?: PreambleSpec;
  detailMarker?: string;
  columns: CsvColumns;
  merchant: 'beforeLastSlash' | 'description';
  currencySource: 'account' | 'preamble';
  totalRow?: { column: string; value: string };
  checksum: 'totalRow' | 'summaryTotalLine';
  kindRules: KindRule[];
}

export interface EmailFields {
  merchant?: RegExp;
  typeAndMerchant?: RegExp;
  dateTime: RegExp;
  cardLast4: RegExp;
  authorization: RegExp;
  reference: RegExp;
  type?: RegExp;
  amount: RegExp;
}

export interface EmailTemplate extends Template {
  senders: string[];
  subject: RegExp;
  dkimDomain: string;
  fields: EmailFields;
  clock: '24h' | '12h';
  typeMap: Record<string, TransactionKind>;
}
