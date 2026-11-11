import type { Account, Currency } from '@finance/shared';
import { AmountParser } from './amount-parser';
import { CsvReader } from './csv-reader';
import { DateParser } from './date-parser';
import { RowParseError, type ParsedTransaction } from './parsed-transaction';
import type { CsvTemplate } from './templates';

export interface StatementMeta {
  holderName?: string | null;
  iban?: string | null;
  currency?: string | null;
  statementDate?: string | null;
}

export interface RawRow {
  line: number;
  fields: Record<string, string>;
}

/** The totals the bank printed in the file. Counts are only printed by BAC. */
export interface Checksum {
  outMinor: number;
  inMinor: number;
  outCount?: number;
  inCount?: number;
}

export interface StatementData {
  meta: StatementMeta;
  rows: RawRow[];
  checksum: Checksum | null;
  /** False when the detail header is missing or has different columns. */
  headerOk: boolean;
}

/** Generic interpreter of declarative CSV templates. */
export class CsvTemplateParser {
  constructor(private readonly reader: CsvReader = new CsvReader()) {}

  extract(lines: string[], template: CsvTemplate): StatementData {
    return template.layout === 'table' ? this.extractTable(lines, template) : this.extractSectioned(lines, template);
  }

  private fieldsOf(line: string, template: CsvTemplate): string[] {
    const fields = this.reader.split(line, template.delimiter);
    if (template.layout === 'table' && fields.length > 0 && fields[fields.length - 1] === '') fields.pop();
    return fields;
  }

  private toRow(header: string[], values: string[], line: number): RawRow {
    const fields: Record<string, string> = {};
    header.forEach((h, i) => (fields[h] = values[i] ?? ''));
    return { line, fields };
  }

  private extractTable(lines: string[], template: CsvTemplate): StatementData {
    const header = this.fieldsOf(lines[0] ?? '', template).map((h) => this.reader.normalize(h));
    const headerOk = header.length === template.header.length && header.every((h, i) => h === template.header[i]);
    const rows: RawRow[] = [];
    let checksum: Checksum | null = null;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      const row = this.toRow(header, this.fieldsOf(lines[i], template), i + 1);
      if (Object.values(row.fields).every((v) => v === '')) continue;
      const total = template.totalRow;
      const isTotal =
        row.fields[template.columns.date] === '' ||
        (total && row.fields[total.column]?.toUpperCase() === total.value.toUpperCase());
      if (isTotal) {
        if (template.checksum === 'totalRow') {
          checksum = {
            outMinor: AmountParser.parse(row.fields[template.columns.debit]) ?? 0,
            inMinor: AmountParser.parse(row.fields[template.columns.credit]) ?? 0,
          };
        }
        continue;
      }
      rows.push(row);
    }
    return { meta: {}, rows, checksum, headerOk };
  }

  /** Preamble → seek detail marker → detail header → rows until a blank line → summary `Total` line. */
  private extractSectioned(lines: string[], template: CsvTemplate): StatementData {
    const spec = template.preamble!;
    const preHeader = this.fieldsOf(lines[0] ?? '', template).map((h) => this.reader.normalize(h));
    const preValues = this.fieldsOf(lines[1] ?? '', template);
    const pre = (name: string) => {
      const idx = preHeader.indexOf(name);
      return idx >= 0 ? preValues[idx] ?? null : null;
    };
    const statementDateText = pre(spec.fields.statementDate);
    const meta: StatementMeta = {
      holderName: pre(spec.fields.holderName),
      iban: pre(spec.fields.iban),
      currency: pre(spec.fields.currency)?.toUpperCase() ?? null,
      statementDate: statementDateText ? DateParser.dmy(statementDateText) : null,
    };

    const markerIdx = lines.findIndex((l) => this.reader.normalize(l) === template.detailMarker);
    if (markerIdx < 0 || markerIdx + 1 >= lines.length) return { meta, rows: [], checksum: null, headerOk: false };
    const header = this.fieldsOf(lines[markerIdx + 1], template).map((h) => this.reader.normalize(h));
    const headerOk = header.length === template.header.length && header.every((h, i) => h === template.header[i]);

    const rows: RawRow[] = [];
    let i = markerIdx + 2;
    for (; i < lines.length; i++) {
      if (lines[i].trim() === '') break;
      rows.push(this.toRow(header, this.fieldsOf(lines[i], template), i + 1));
    }
    let checksum: Checksum | null = null;
    for (; i < lines.length; i++) {
      const fields = this.fieldsOf(lines[i], template);
      if (this.reader.normalize(fields[0] ?? '') === 'total') {
        checksum = {
          outCount: Number(fields[1]),
          outMinor: AmountParser.parse(fields[2]) ?? 0,
          inCount: Number(fields[3]),
          inMinor: AmountParser.parse(fields[4]) ?? 0,
        };
        break;
      }
    }
    return { meta, rows, checksum, headerOk };
  }

  /** One data row → `ParsedTransaction` (kind is the default for its direction until `KindResolver` runs). */
  parseRow(row: RawRow, template: CsvTemplate, meta: StatementMeta, account: Pick<Account, 'id' | 'currency'>): ParsedTransaction {
    const c = template.columns;
    const localDate = DateParser.dmy(row.fields[c.date] ?? '');
    if (!localDate) throw new RowParseError('Unreadable date');
    const debit = AmountParser.parse(row.fields[c.debit]);
    const credit = AmountParser.parse(row.fields[c.credit]);
    if ((debit === null) === (credit === null)) throw new RowParseError('The row must have exactly one of debit or credit');
    const direction = debit !== null ? 'out' : 'in';
    const description = (row.fields[c.description] ?? '').trim();
    let merchantRaw = description;
    if (template.merchant === 'beforeLastSlash' && description.includes('/')) {
      merchantRaw = description.slice(0, description.lastIndexOf('/')).trim();
    }
    if (!merchantRaw) throw new RowParseError('Missing description');
    const currency = (template.currencySource === 'preamble' ? meta.currency : account.currency) as Currency;
    return {
      accountId: account.id,
      localDate,
      occurredAt: null,
      direction,
      kind: direction === 'out' ? 'purchase' : 'income',
      currency,
      amountMinor: (debit ?? credit)!,
      merchantRaw,
      statementRef: row.fields[c.ref] || null,
      bankCode: c.code ? row.fields[c.code] || null : null,
      source: 'csv',
      line: row.line,
    };
  }
}
