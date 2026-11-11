import type { Bank, Currency, TransactionKind } from '@finance/shared';

export interface Template {
  id: string;
  bank: Bank;
}

export interface KindRule {
  direction: 'out' | 'in';
  pattern: RegExp;
  /** `ownAccount`: captured number inside a registered IBAN; `holderName`: captured name is the holder. */
  when?: 'ownAccount' | 'holderName';
  kind: TransactionKind;
}

export interface PreambleSpec {
  header: string[];
  fields: { holderName: string; iban: string; currency: string; statementDate: string };
}

export interface CsvTemplate extends Template {
  layout: 'table' | 'sectioned';
  delimiter: string;
  /** Normalized detail header (without a trailing empty field). */
  header: string[];
  preamble?: PreambleSpec;
  detailMarker?: string;
  columns: { date: string; ref: string; code?: string; description: string; debit: string; credit: string };
  merchant: 'beforeLastSlash' | 'description';
  currencySource: 'account' | 'preamble';
  totalRow?: { column: string; value: string };
  checksum: 'totalRow' | 'summaryTotalLine';
  kindRules: KindRule[];
}

export interface EmailTemplate extends Template {
  senders: string[];
  subject: RegExp;
  dkimDomain: string;
  fields: Record<string, RegExp>;
  clock: '12h' | '24h';
  typeMap: Record<string, TransactionKind>;
}

export type { Currency };
