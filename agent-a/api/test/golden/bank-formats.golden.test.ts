/**
 * Golden tests: every redacted sample in samples/ through its template parser, asserting the
 * results listed in diagrams/bank-formats.md (sections 5 and 6c).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ParsedTransaction, TransactionKind } from '../../../shared/types';
import { CsvReader } from '../../src/ingest/csv-reader';
import { CsvTemplateParser } from '../../src/ingest/csv-template-parser';
import { EmailTemplateParser } from '../../src/ingest/email-template-parser';
import { KindResolver } from '../../src/ingest/kind-resolver';
import { ParsedRowSchema } from '../../src/ingest/parsed-row-schema';
import { TemplateRegistry } from '../../src/ingest/template-registry';
import { SAMPLE_ACCOUNTS } from '../sample-accounts';

const SAMPLES = join(__dirname, '..', '..', '..', 'samples');
const read = (name: string) => readFileSync(join(SAMPLES, name));
const account = (id: string) => SAMPLE_ACCOUNTS.find((a) => a.id === id)!;
const ownIbans = SAMPLE_ACCOUNTS.map((a) => a.iban).filter((i): i is string => !!i);

function parseStatement(file: string, accountId: string) {
  const registry = new TemplateRegistry();
  const parser = new CsvTemplateParser();
  const resolver = new KindResolver();
  const lines = CsvReader.decode(read(file));
  const template = registry.detect(lines);
  expect(template).not.toBeNull();
  const data = parser.extract(lines, template!);
  const rows: ParsedTransaction[] = data.rows.map((row) => {
    const parsed = ParsedRowSchema.validate(parser.parseRow(row, template!, data.meta, account(accountId)));
    parsed.kind = resolver.resolve(parsed, template!.kindRules, ownIbans, data.meta.holderName);
    return parsed;
  });
  return { template: template!, data, rows };
}

function kinds(rows: ParsedTransaction[]): Partial<Record<TransactionKind, number>> {
  const out: Partial<Record<TransactionKind, number>> = {};
  for (const r of rows) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}

function sum(rows: ParsedTransaction[], direction: 'out' | 'in') {
  const sel = rows.filter((r) => r.direction === direction);
  return { count: sel.length, minor: sel.reduce((s, r) => s + r.amountMinor, 0) };
}

describe('bac-statement-usd.csv (bac-transacciones-mes)', () => {
  const { template, data, rows } = parseStatement('bac-statement-usd.csv', 'acc-bac-usd');

  it('is detected as the BAC template and reads the preamble', () => {
    expect(template.id).toBe('bac-transacciones-mes');
    expect(data.headerOk).toBe(true);
    expect(data.meta).toEqual({
      holderName: 'ANA MARIA PRUEBA SOLANO',
      iban: 'CR00010200001234567890',
      currency: 'USD',
      statementDate: '2026-10-31',
    });
  });

  it('has 65 rows: 61 out for $2,032.43 and 4 in for $1,913.67', () => {
    expect(rows).toHaveLength(65);
    expect(sum(rows, 'out')).toEqual({ count: 61, minor: 203243 });
    expect(sum(rows, 'in')).toEqual({ count: 4, minor: 191367 });
    expect(rows.every((r) => r.currency === 'USD')).toBe(true);
  });

  it('matches the printed Total line', () => {
    expect(data.checksum).toEqual({ outCount: 61, outMinor: 203243, inCount: 4, inMinor: 191367 });
  });

  it('resolves the kinds listed in bank-formats.md', () => {
    expect(kinds(rows)).toEqual({
      transfer: 58,
      payment_sent: 2,
      sinpe_sent: 2,
      purchase: 1,
      sinpe_received: 1,
      income: 1,
    });
    const transfers = rows.filter((r) => r.kind === 'transfer');
    expect(transfers.filter((r) => r.direction === 'out')).toHaveLength(56);
    expect(transfers.filter((r) => r.direction === 'in')).toHaveLength(2);
  });

  it.each([
    [6, '2026-10-01', '406477115', 'TEF A : 123456781', 'out', 1549, 'transfer'],
    [12, '2026-10-05', '958480982', 'SINPE MOVIL Gasolina_______', 'out', 1111, 'sinpe_sent'],
    [27, '2026-10-10', '951570525', 'Pago Liberty Móvil (Movistar 8', 'out', 2738, 'purchase'],
    [32, '2026-10-12', '666456850', 'DTR:inversiones_hapi_VT', 'out', 30500, 'payment_sent'],
    [43, '2026-10-20', '301433811', 'DTR SINPE ANA_MARIA_PRUEBA_SOL', 'in', 100000, 'transfer'],
    [47, '2026-10-20', '406457526', 'TEF A : 987654321', 'out', 100000, 'payment_sent'],
    [65, '2026-10-30', '960482912', 'CD SINPE 213585__', 'in', 71336, 'sinpe_received'],
    [70, '2026-10-31', '103152278', 'INTERESES', 'in', 31, 'income'],
  ])('line %i', (line, localDate, statementRef, merchantRaw, direction, amountMinor, kind) => {
    const row = rows.find((r) => r.line === line)!;
    expect(row).toMatchObject({
      localDate,
      statementRef,
      merchantRaw,
      direction,
      amountMinor,
      kind,
      currency: 'USD',
      occurredAt: null,
      accountId: 'acc-bac-usd',
      source: 'csv',
    });
  });
});

describe('bn-statement-usd.csv (bn-consulta-saldos)', () => {
  const { template, data, rows } = parseStatement('bn-statement-usd.csv', 'acc-bn-usd');

  it('is detected as the BN template', () => {
    expect(template.id).toBe('bn-consulta-saldos');
  });

  it('has 5 rows: 2 out for $1,304.65 and 3 in for $1,305.00, skipping the total row', () => {
    expect(rows).toHaveLength(5);
    expect(sum(rows, 'out')).toEqual({ count: 2, minor: 130465 });
    expect(sum(rows, 'in')).toEqual({ count: 3, minor: 130500 });
    expect(data.checksum).toEqual({ outMinor: 130465, inMinor: 130500 });
  });

  it('takes the currency from the account and defaults the kinds', () => {
    expect(rows.every((r) => r.currency === 'USD')).toBe(true);
    expect(kinds(rows)).toEqual({ purchase: 2, income: 3 });
  });

  it.each([
    [2, '2026-10-20', '85365331', 'ABOGADO', 'out', 100000, 'purchase'],
    [5, '2026-10-12', '10605622', 'PAGO SPAY 723329', 'out', 30465, 'purchase'],
    [6, '2026-10-12', '10602201', 'INVERSIONES HAPI VT', 'in', 30500, 'income'],
  ])('line %i', (line, localDate, statementRef, merchantRaw, direction, amountMinor, kind) => {
    expect(rows.find((r) => r.line === line)).toMatchObject({
      localDate,
      statementRef,
      merchantRaw,
      direction,
      amountMinor,
      kind,
      currency: 'USD',
    });
  });
});

describe('card alert emails', () => {
  const registry = new TemplateRegistry();
  const parser = new EmailTemplateParser();

  it('bac-card-alert.eml (bac-notificacion)', async () => {
    const mime = read('bac-card-alert.eml');
    const env = await parser.envelope(mime);
    expect(env.sender.toLowerCase()).toBe('notificacionbac@baccredomatic.cr');
    const template = registry.match(env.sender, env.subject);
    expect(template?.id).toBe('bac-notificacion');
    const parsed = await parser.parse(mime, template!);
    expect(parsed).toMatchObject({
      merchantRaw: 'FM ESC AVENIDA ESCAZU',
      occurredAt: '2026-11-10T12:18:00-06:00',
      localDate: '2026-11-10',
      cardLast4: '1111',
      currency: 'CRC',
      amountMinor: 200000,
      statementRef: '15723379',
      authorization: '001818',
      kind: 'purchase',
      direction: 'out',
      source: 'gmail',
    });
    const routed = SAMPLE_ACCOUNTS.find((a) => a.cardLast4s.includes(parsed.cardLast4!));
    expect(routed?.name).toBe('BAC colones');
  });

  it('bn-voucher-digital.eml (bn-voucher-digital)', async () => {
    const mime = read('bn-voucher-digital.eml');
    const env = await parser.envelope(mime);
    const template = registry.match(env.sender, env.subject);
    expect(template?.id).toBe('bn-voucher-digital');
    const parsed = await parser.parse(mime, template!);
    expect(parsed).toMatchObject({
      merchantRaw: 'TRANSPORTES JACO CENTRAL CR',
      occurredAt: '2026-08-31T10:42:00-06:00',
      localDate: '2026-08-31',
      cardLast4: '2222',
      currency: 'CRC',
      amountMinor: 11300,
      statementRef: '624316493500',
      authorization: '638122',
      kind: 'purchase',
    });
    const routed = SAMPLE_ACCOUNTS.find((a) => a.cardLast4s.includes(parsed.cardLast4!));
    expect(routed?.name).toBe('BN colones');
  });

  it('every sample in samples/ has a golden test', () => {
    const covered = ['bac-statement-usd.csv', 'bn-statement-usd.csv', 'bac-card-alert.eml', 'bn-voucher-digital.eml'];
    const files = readdirSync(SAMPLES).filter((f) => f.endsWith('.csv') || f.endsWith('.eml'));
    expect(files.sort()).toEqual(covered.sort());
  });
});
