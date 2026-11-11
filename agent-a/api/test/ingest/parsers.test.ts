import { describe, expect, it } from 'vitest';
import { AmountParser } from '../../src/ingest/amount-parser';
import { CsvReader } from '../../src/ingest/csv-reader';
import { DateParser } from '../../src/ingest/date-parser';
import { DkimVerifier } from '../../src/ingest/dkim-verifier';
import { EmailTemplateParser } from '../../src/ingest/email-template-parser';
import { HtmlText } from '../../src/ingest/html-text';
import { KindResolver } from '../../src/ingest/kind-resolver';
import { bacNotificacion } from '../../src/ingest/templates';
import { BAC_KIND_RULES as RULES } from '../../src/ingest/templates/bac-transacciones-mes';

describe('AmountParser', () => {
  it.each([
    ['1,000.00', 100000],
    ['3948.11', 394811],
    ['CRC 2,000.00', 200000],
    ['CRC 113,00', 11300],
    ['1.234.567,89', 123456789],
    ['1,000', 100000],
    ['', null],
    ['0.00', null],
  ])('%s → %s', (text, minor) => {
    expect(AmountParser.parse(text)).toBe(minor);
  });
});

describe('DateParser', () => {
  it('parses dates, months, and times', () => {
    expect(DateParser.dmy('31/10/2026')).toBe('2026-10-31');
    expect(DateParser.dmy('31/02/2026')).toBeNull();
    expect(DateParser.month('Ago')).toBe(8);
    expect(DateParser.month('SET')).toBe(9);
    expect(DateParser.month('dec')).toBe(12);
    expect(DateParser.time(12, 5, 'a.m.')).toBe('00:05');
    expect(DateParser.time(12, 5, 'p.m.')).toBe('12:05');
    expect(DateParser.time(10, 42, 'p.m.')).toBe('22:42');
    expect(DateParser.time(12, 18)).toBe('12:18');
  });
});

describe('CsvReader', () => {
  const reader = new CsvReader();
  it('decodes UTF-8, falls back to Windows-1252, and strips a BOM', () => {
    expect(reader.decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0x62]))).toEqual(['a', 'b']);
    expect(reader.decode(new Uint8Array([0x4d, 0xf3, 0x76, 0x69, 0x6c])))
      .toEqual(['Móvil']);
  });
  it('normalizes headers', () => {
    expect(reader.normalize(' Código de Transacción ')).toBe('codigo de transaccion');
  });
});

describe('HtmlText', () => {
  it('drops head, style, comments and Outlook conditionals, and decodes entities', () => {
    const html = '<html><head><title>x</title></head><style>p{}</style><!--[if mso]><p>mso</p><![endif]--><p>Comercio:&nbsp;<b>AB&amp;C</b></p>\n<p>Monto: CRC&#32;1</p></html>';
    expect(HtmlText.toText(html)).toBe('Comercio: AB&C Monto: CRC 1');
  });
});

describe('KindResolver', () => {
  const k = new KindResolver();
  const own = ['CR00010200000123456781'];
  it('applies the BAC rules in order', () => {
    expect(k.resolve({ direction: 'out', merchantRaw: 'TEF A : 123456781' }, RULES, own, null)).toBe('transfer');
    expect(k.resolve({ direction: 'out', merchantRaw: 'TEF A : 987654321' }, RULES, own, null)).toBe('payment_sent');
    expect(k.resolve({ direction: 'in', merchantRaw: 'DTR SINPE ANA_MARIA' }, RULES, own, 'ANA MARIA PRUEBA SOLANO')).toBe('sinpe_received');
    expect(k.resolve({ direction: 'in', merchantRaw: 'DTR SINPE ANA_MARIA_PRUEBA_SOL' }, RULES, own, 'ANA MARIA PRUEBA SOLANO')).toBe('transfer');
    expect(k.resolve({ direction: 'out', merchantRaw: 'AUTOMERCADO' }, RULES, own, null)).toBe('purchase');
    expect(k.resolve({ direction: 'in', merchantRaw: 'SALARIO' }, [], own, null)).toBe('income');
  });
});

describe('EmailTemplateParser', () => {
  const parser = new EmailTemplateParser();
  const text =
    'Comercio: TIENDA Ciudad y país: SAN JOSE Fecha: Nov 10, 2026, 12:18 MASTER: ************1111 Autorización: 1 Referencia: 2 Tipo de Transacción: DEVOLUCIÓN Monto: USD 5.00 fin';

  it('maps DEVOLUCION to a refund that moves money in', () => {
    expect(parser.parseText(text, bacNotificacion)).toMatchObject({ kind: 'refund', direction: 'in', currency: 'USD', amountMinor: 500 });
  });

  it('reports an unknown type and a missing field', () => {
    expect(() => parser.parseText(text.replace('DEVOLUCIÓN', 'RETIRO'), bacNotificacion)).toThrow('UNKNOWN_TYPE:RETIRO');
    expect(() => parser.parseText(text.replace('Comercio:', 'Shop:'), bacNotificacion)).toThrow('FIELD_MISSING:merchant');
  });
});

describe('DkimVerifier', () => {
  it('passes only for a valid signature from the domain or a subdomain', async () => {
    const stub = (results: { signingDomain: string; status: { result: string } }[]) => new DkimVerifier(async () => ({ results }));
    const mime = new Uint8Array([1]);
    expect(await stub([{ signingDomain: 'amazonses.com', status: { result: 'pass' } }]).verify(mime, 'baccredomatic.cr')).toBe(false);
    expect(
      await stub([
        { signingDomain: 'amazonses.com', status: { result: 'pass' } },
        { signingDomain: 'baccredomatic.cr', status: { result: 'pass' } },
      ]).verify(mime, 'baccredomatic.cr'),
    ).toBe(true);
    expect(await stub([{ signingDomain: 'mail.bncr.fi.cr', status: { result: 'pass' } }]).verify(mime, 'bncr.fi.cr')).toBe(true);
    expect(await stub([{ signingDomain: 'bncr.fi.cr', status: { result: 'fail' } }]).verify(mime, 'bncr.fi.cr')).toBe(false);
    expect(await stub([{ signingDomain: 'evilbncr.fi.cr', status: { result: 'pass' } }]).verify(mime, 'bncr.fi.cr')).toBe(false);
  });
});
