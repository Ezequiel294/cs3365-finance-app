import type { Account, Currency, ParsedTransaction } from '../../../shared/types';
import { AmountParser } from './amount-parser';
import { CsvReader } from './csv-reader';
import { DateParser } from './date-parser';
import type { CsvTemplate } from './templates/types';

export interface StatementMeta {
  holderName: string | null;
  iban: string | null;
  currency: string | null;
  statementDate: string | null;
}

export interface RawRow {
  line: number;
  values: Record<string, string>;
}

export interface PrintedTotals {
  outMinor: number;
  inMinor: number;
  outCount?: number;
  inCount?: number;
}

export interface StatementData {
  meta: StatementMeta;
  rows: RawRow[];
  checksum: PrintedTotals | null;
  /** False when the detail header is missing or its columns differ from the template's. */
  headerOk: boolean;
}

export class RowParseError extends Error {
  constructor(
    readonly line: number,
    readonly reason: string,
  ) {
    super(reason);
  }
}

const EMPTY_META: StatementMeta = { holderName: null, iban: null, currency: null, statementDate: null };

/** The generic statement parser; every bank-specific detail comes from the template. */
export class CsvTemplateParser {
  extract(lines: string[], template: CsvTemplate): StatementData {
    return template.layout === 'table' ? this.extractTable(lines, template) : this.extractSectioned(lines, template);
  }

  private extractTable(lines: string[], t: CsvTemplate): StatementData {
    const header = CsvReader.split(lines[0] ?? '', t.delimiter).map(CsvReader.normalize);
    const headerOk = header.length === t.header.length && t.header.every((h, i) => header[i] === h);
    const rows: RawRow[] = [];
    let checksum: PrintedTotals | null = null;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.trim()) continue;
      const values = toValues(header, CsvReader.split(line, t.delimiter), t);
      const isTotal =
        !values[t.columns.date] ||
        (t.totalRow && (values[t.totalRow.column] ?? '').toUpperCase() === t.totalRow.value.toUpperCase());
      if (isTotal) {
        if (t.checksum === 'totalRow') {
          checksum = {
            outMinor: AmountParser.parse(values[t.columns.debit]) ?? 0,
            inMinor: AmountParser.parse(values[t.columns.credit]) ?? 0,
          };
        }
        continue;
      }
      rows.push({ line: i + 1, values });
    }
    return { meta: { ...EMPTY_META }, rows, checksum, headerOk };
  }

  /** State machine: Preamble → SeekDetail → DetailHeader → Rows → SeekTotal. */
  private extractSectioned(lines: string[], t: CsvTemplate): StatementData {
    const meta: StatementMeta = { ...EMPTY_META };
    const rows: RawRow[] = [];
    let checksum: PrintedTotals | null = null;
    let headerOk = false;
    let header: string[] = [];
    let state: 'Preamble' | 'SeekDetail' | 'DetailHeader' | 'Rows' | 'SeekTotal' | 'Done' = 'Preamble';

    const preambleHeader = CsvReader.split(lines[0] ?? '', t.delimiter).map(CsvReader.normalize);
    for (let i = 1; i < lines.length && state !== 'Done'; i++) {
      const line = lines[i]!;
      switch (state) {
        case 'Preamble': {
          const fields = CsvReader.split(line, t.delimiter);
          const byName: Record<string, string> = {};
          preambleHeader.forEach((h, idx) => (byName[h] = fields[idx] ?? ''));
          const f = t.preamble!.fields;
          meta.holderName = byName[f.holderName] || null;
          meta.iban = byName[f.iban] || null;
          meta.currency = (byName[f.currency] || '').toUpperCase() || null;
          meta.statementDate = DateParser.dmy(byName[f.statementDate] ?? '') ?? null;
          state = 'SeekDetail';
          break;
        }
        case 'SeekDetail':
          if (CsvReader.normalize(line) === t.detailMarker) state = 'DetailHeader';
          break;
        case 'DetailHeader':
          header = CsvReader.split(line, t.delimiter).map(CsvReader.normalize);
          headerOk = header.length === t.header.length && t.header.every((h, idx) => header[idx] === h);
          state = headerOk ? 'Rows' : 'Done';
          break;
        case 'Rows':
          if (!line.trim()) {
            state = 'SeekTotal';
            break;
          }
          rows.push({ line: i + 1, values: toValues(header, CsvReader.split(line, t.delimiter), t) });
          break;
        case 'SeekTotal': {
          const fields = CsvReader.split(line, t.delimiter);
          if (CsvReader.normalize(fields[0] ?? '') === 'total') {
            checksum = {
              outCount: Number(fields[1]),
              outMinor: AmountParser.parse(fields[2]) ?? 0,
              inCount: Number(fields[3]),
              inMinor: AmountParser.parse(fields[4]) ?? 0,
            };
            state = 'Done';
          }
          break;
        }
      }
    }
    return { meta, rows, checksum, headerOk };
  }

  /** One data row → ParsedTransaction (kind is the direction default; KindResolver refines it). */
  parseRow(
    row: RawRow,
    template: CsvTemplate,
    meta: StatementMeta,
    account: Pick<Account, 'id' | 'currency'>,
  ): ParsedTransaction {
    const c = template.columns;
    const v = row.values;
    const localDate = DateParser.dmy(v[c.date] ?? '');
    if (!localDate) throw new RowParseError(row.line, 'Unreadable date');
    const debit = AmountParser.parse(v[c.debit]);
    const credit = AmountParser.parse(v[c.credit]);
    if ((debit && credit) || (!debit && !credit)) {
      throw new RowParseError(row.line, 'The row needs exactly one of debit or credit');
    }
    const currency = (template.currencySource === 'preamble' ? meta.currency : account.currency) ?? '';
    if (currency !== 'CRC' && currency !== 'USD') throw new RowParseError(row.line, 'Unknown currency');
    const description = (v[c.description] ?? '').trim();
    const merchantRaw =
      template.merchant === 'beforeLastSlash' && description.includes('/')
        ? description.slice(0, description.lastIndexOf('/')).trim()
        : description;
    if (!merchantRaw) throw new RowParseError(row.line, 'Missing description');
    const direction = debit ? 'out' : 'in';
    return {
      accountId: account.id,
      cardLast4: null,
      localDate,
      occurredAt: null,
      direction,
      kind: direction === 'out' ? 'purchase' : 'income',
      currency: currency as Currency,
      amountMinor: (debit ?? credit)!,
      merchantRaw,
      statementRef: (v[c.ref] ?? '').trim() || null,
      bankCode: c.code ? (v[c.code] ?? '').trim() || null : null,
      authorization: null,
      source: 'csv',
      sourceRef: null,
      line: row.line,
    };
  }
}

/** Map fields to column names. Extra fields (a description containing the delimiter) are joined back. */
function toValues(header: string[], fields: string[], t: CsvTemplate): Record<string, string> {
  let f = fields;
  if (f.length > header.length) {
    const descIdx = header.indexOf(t.columns.description);
    if (descIdx >= 0) {
      const extra = f.length - header.length;
      const joined = f.slice(descIdx, descIdx + extra + 1).join(`${t.delimiter} `);
      f = [...f.slice(0, descIdx), joined, ...f.slice(descIdx + extra + 1)];
    }
  }
  const values: Record<string, string> = {};
  header.forEach((h, i) => (values[h] = f[i] ?? ''));
  return values;
}
