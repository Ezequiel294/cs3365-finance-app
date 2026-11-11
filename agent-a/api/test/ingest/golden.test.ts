import { describe, expect, it } from 'vitest';
import { CsvReader } from '../../src/ingest/csv-reader';
import { CsvTemplateParser } from '../../src/ingest/csv-template-parser';
import { EmailTemplateParser } from '../../src/ingest/email-template-parser';
import { KindResolver } from '../../src/ingest/kind-resolver';
import { ParsedRowSchema, type ParsedTransaction } from '../../src/ingest/parsed-transaction';
import { TemplateRegistry } from '../../src/ingest/template-registry';
import { account, sample, TEST_ACCOUNTS } from '../helpers';

/**
 * Golden tests: every file in samples/ through its parser, asserting the results
 * listed in diagrams/bank-formats.md.
 */
const reader = new CsvReader();
const registry = new TemplateRegistry();
const parser = new CsvTemplateParser();
const kinds = new KindResolver();
const ownIbans = TEST_ACCOUNTS.map((a) => a.iban).filter((i): i is string => !!i);

function parseStatement(file: string, accountId: string) {
  const lines = reader.decode(sample(file));
  const template = registry.detect(lines);
  expect(template).not.toBeNull();
  const data = parser.extract(lines, template!);
  const rows: ParsedTransaction[] = data.rows.map((row) => {
    const parsed = ParsedRowSchema.validate(parser.parseRow(row, template!, data.meta, account(accountId)));
    parsed.kind = kinds.resolve(parsed, template!.kindRules, ownIbans, data.meta.holderName);
    return parsed;
  });
  return { template: template!, data, rows };
}

function tally(rows: ParsedTransaction[]) {
  const out = rows.filter((r) => r.direction === 'out');
  const inn = rows.filter((r) => r.direction === 'in');
  const kindsCount: Record<string, number> = {};
  for (const r of rows) kindsCount[r.kind] = (kindsCount[r.kind] ?? 0) + 1;
  return {
    outCount: out.length,
    outMinor: out.reduce((s, r) => s + r.amountMinor, 0),
    inCount: inn.length,
    inMinor: inn.reduce((s, r) => s + r.amountMinor, 0),
    kinds: kindsCount,
  };
}

const byLine = (rows: ParsedTransaction[], line: number) => rows.find((r) => r.line === line)!;

describe('bac-statement-usd.csv → bac-transacciones-mes', () => {
  const { template, data, rows } = parseStatement('bac-statement-usd.csv', 'acc-bac-usd');

  it('detects the template and reads the preamble', () => {
    expect(template.id).toBe('bac-transacciones-mes');
    expect(data.headerOk).toBe(true);
    expect(data.meta).toEqual({
      holderName: 'ANA MARIA PRUEBA SOLANO',
      iban: 'CR00010200001234567890',
      currency: 'USD',
      statementDate: '2026-10-31',
    });
  });

  it('reads 65 rows whose totals match the printed summary', () => {
    expect(rows).toHaveLength(65);
    const t = tally(rows);
    expect(t.outCount).toBe(61);
    expect(t.outMinor).toBe(203243);
    expect(t.inCount).toBe(4);
    expect(t.inMinor).toBe(191367);
    expect(data.checksum).toEqual({ outCount: 61, outMinor: 203243, inCount: 4, inMinor: 191367 });
    expect(rows.every((r) => r.currency === 'USD')).toBe(true);
  });

  it('resolves the kinds', () => {
    const t = tally(rows);
    expect(t.kinds).toEqual({ transfer: 58, payment_sent: 2, sinpe_sent: 2, purchase: 1, sinpe_received: 1, income: 1 });
    expect(rows.filter((r) => r.kind === 'transfer' && r.direction === 'out')).toHaveLength(56);
    expect(rows.filter((r) => r.kind === 'transfer' && r.direction === 'in')).toHaveLength(2);
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
  ])('line %i matches field by field', (line, localDate, statementRef, merchantRaw, direction, amountMinor, kind) => {
    const row = byLine(rows, line);
    expect(row).toMatchObject({ localDate, statementRef, merchantRaw, direction, amountMinor, kind, currency: 'USD', occurredAt: null });
  });
});

describe('bn-statement-usd.csv → bn-consulta-saldos', () => {
  const { template, data, rows } = parseStatement('bn-statement-usd.csv', 'acc-bn-usd');

  it('detects the template and skips the total row', () => {
    expect(template.id).toBe('bn-consulta-saldos');
    expect(rows).toHaveLength(5);
    expect(data.checksum).toEqual({ outMinor: 130465, inMinor: 130500 });
  });

  it('matches the printed totals and kinds', () => {
    const t = tally(rows);
    expect(t).toMatchObject({ outCount: 2, outMinor: 130465, inCount: 3, inMinor: 130500 });
    expect(t.kinds).toEqual({ purchase: 2, income: 3 });
    expect(rows.every((r) => r.currency === 'USD')).toBe(true);
  });

  it.each([
    [2, '2026-10-20', '85365331', 'ABOGADO', 'out', 100000, 'purchase'],
    [5, '2026-10-12', '10605622', 'PAGO SPAY 723329', 'out', 30465, 'purchase'],
    [6, '2026-10-12', '10602201', 'INVERSIONES HAPI VT', 'in', 30500, 'income'],
  ])('line %i matches field by field', (line, localDate, statementRef, merchantRaw, direction, amountMinor, kind) => {
    expect(byLine(rows, line)).toMatchObject({ localDate, statementRef, merchantRaw, direction, amountMinor, kind });
  });

  it('takes the currency from the chosen account', () => {
    const lines = reader.decode(sample('bn-statement-usd.csv'));
    const tpl = registry.detect(lines)!;
    const d = parser.extract(lines, tpl);
    expect(parser.parseRow(d.rows[0], tpl, d.meta, account('acc-bn-crc')).currency).toBe('CRC');
  });
});

describe('alert emails', () => {
  const emails = new EmailTemplateParser();

  it.each([
    ['bac-card-alert.eml', 'bac-notificacion', {
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
    }, 'acc-bac-crc'],
    ['bn-voucher-digital.eml', 'bn-voucher-digital', {
      merchantRaw: 'TRANSPORTES JACO CENTRAL CR',
      occurredAt: '2026-08-31T10:42:00-06:00',
      localDate: '2026-08-31',
      cardLast4: '2222',
      currency: 'CRC',
      amountMinor: 11300,
      statementRef: '624316493500',
      authorization: '638122',
      kind: 'purchase',
      direction: 'out',
      source: 'gmail',
    }, 'acc-bn-crc'],
  ])('%s parses with %s', async (file, templateId, expected, accountId) => {
    const raw = sample(file);
    const { mail, headers } = await EmailTemplateParser.readMail(raw);
    expect(registry.isAllowedSender(headers.from)).toBe(true);
    const template = registry.match(headers.from, headers.subject);
    expect(template?.id).toBe(templateId);
    const parsed = await emails.parse(mail, template!);
    expect(parsed).toMatchObject(expected);
    // Routed by the card's last four digits to the colones account.
    const routed = TEST_ACCOUNTS.find((a) => a.cardLast4s.includes(parsed.cardLast4));
    expect(routed?.id).toBe(accountId);
  });

  it('decodes the RFC 2047 subject of the BAC alert', async () => {
    const { headers } = await EmailTemplateParser.readMail(sample('bac-card-alert.eml'));
    expect(headers.subject.startsWith('Notificación de transacción ')).toBe(true);
    expect(headers.from).toBe('NotificacionBAC@baccredomatic.cr');
  });
});
