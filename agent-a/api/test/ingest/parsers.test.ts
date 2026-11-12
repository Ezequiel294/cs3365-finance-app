import { describe, expect, it } from 'vitest';
import { AmountParser } from '../../src/ingest/amount-parser';
import { CsvReader } from '../../src/ingest/csv-reader';
import { CsvTemplateParser, RowParseError } from '../../src/ingest/csv-template-parser';
import { DateParser } from '../../src/ingest/date-parser';
import { EmailParseError, EmailTemplateParser, headerMessageId } from '../../src/ingest/email-template-parser';
import { HtmlText } from '../../src/ingest/html-text';
import { KindResolver } from '../../src/ingest/kind-resolver';
import { TemplateRegistry } from '../../src/ingest/template-registry';
import { bacNotificacion, bacTransaccionesMes, bnConsultaSaldos, bnVoucherDigital } from '../../src/ingest/templates';
import { BAC_KIND_RULES } from '../../src/ingest/templates/bac-transacciones-mes';

describe('AmountParser', () => {
  it.each([
    ['1,000.00', 100000],
    ['3948.11', 394811],
    ['CRC 2,000.00', 200000],
    ['CRC 113,00', 11300],
    ['1.234,56', 123456],
    ['1,000', 100000],
    ['15', 1500],
  ])('%s → %i', (text, minor) => expect(AmountParser.parse(text)).toBe(minor));

  it('empty and zero mean no amount', () => {
    expect(AmountParser.parse('')).toBeNull();
    expect(AmountParser.parse('0.00')).toBeNull();
    expect(AmountParser.parse(undefined)).toBeNull();
  });
});

describe('DateParser', () => {
  it('dmy', () => {
    expect(DateParser.dmy('20/10/2026')).toBe('2026-10-20');
    expect(DateParser.dmy('31/02/2026')).toBeNull();
    expect(DateParser.dmy('2026-10-20')).toBeNull();
  });
  it('month in Spanish or English', () => {
    expect(DateParser.month('Ago')).toBe(8);
    expect(DateParser.month('SET')).toBe(9);
    expect(DateParser.month('dec')).toBe(12);
    expect(DateParser.month('xyz')).toBeNull();
  });
  it('time', () => {
    expect(DateParser.time(12, 5, 'a')).toBe('00:05');
    expect(DateParser.time(12, 5, 'p')).toBe('12:05');
    expect(DateParser.time(1, 30, 'p.m.')).toBe('13:30');
    expect(DateParser.time(18, 0)).toBe('18:00');
  });
});

describe('CsvReader', () => {
  it('falls back to Windows-1252 and strips a BOM', () => {
    const cp1252 = new Uint8Array([0x4e, 0xfa, 0x6d, 0x65, 0x72, 0x6f, 0x0d, 0x0a, 0x78]); // "Número\r\nx"
    expect(CsvReader.decode(cp1252)).toEqual(['Número', 'x']);
    const bom = new TextEncoder().encode('\ufeffa;b\nc');
    expect(CsvReader.decode(bom)).toEqual(['a;b', 'c']);
  });
  it('normalize removes accents and case', () => {
    expect(CsvReader.normalize(' Código de Transacción ')).toBe('codigo de transaccion');
  });
  it('split drops the trailing empty field', () => {
    expect(CsvReader.split('a;b;;', ';')).toEqual(['a', 'b', '']);
    expect(CsvReader.split('a; b ;c;', ';')).toEqual(['a', 'b', 'c']);
  });
});

describe('HtmlText', () => {
  it('removes head, styles, comments and collapses whitespace', () => {
    const html =
      '<html><head><title>x</title></head><style>p{}</style><!--[if mso]><p>no</p><![endif]--><p>Hola&nbsp;Ana</p>\n<td>Monto:</td><td>CRC&#32;2,000.00</td></html>';
    expect(HtmlText.toText(html)).toBe('Hola Ana Monto: CRC 2,000.00');
  });
});

describe('TemplateRegistry', () => {
  const registry = new TemplateRegistry();
  it('does not detect unrelated files', () => {
    expect(registry.detect(['date,amount', '2026-10-01,5'])).toBeNull();
    expect(registry.detect([''])).toBeNull();
  });
  it('requires the BAC detail marker', () => {
    expect(registry.detect(['Número de Clientes, Nombre, Producto, Moneda, Saldo', '1, A, B, USD'])).toBeNull();
  });
  it('matches emails by sender (case-insensitive) and subject', () => {
    expect(registry.match('NotificacionBAC@baccredomatic.cr', 'Notificación de transacción X')).toBe(bacNotificacion);
    expect(registry.match('bncontacto@bncr.fi.cr', 'Voucher Digital')).toBe(bnVoucherDigital);
    expect(registry.match('bncontacto@bncr.fi.cr', 'Estado de cuenta')).toBeNull();
    expect(registry.senderAllowlist()).toEqual(['notificacionbac@baccredomatic.cr', 'bncontacto@bncr.fi.cr']);
  });
});

describe('CsvTemplateParser', () => {
  const parser = new CsvTemplateParser();
  const account = { id: 'a', currency: 'USD' as const };

  it('turns a bad row into a row error with its line', () => {
    const lines = [
      'oficina;fechaMovimiento;numeroDocumento;debito;credito;descripcion;',
      '0;99/10/2026;1;5.00;;X/Y;',
      '0;20/10/2026;2;5.00;6.00;X/Y;',
      '0;20/10/2026;3;;;X/Y;',
      '0;20/10/2026;4;5.00;;SHOP;',
    ];
    const data = parser.extract(lines, bnConsultaSaldos);
    const results = data.rows.map((r) => {
      try {
        return parser.parseRow(r, bnConsultaSaldos, data.meta, account);
      } catch (e) {
        return e as RowParseError;
      }
    });
    expect((results[0] as RowParseError).line).toBe(2);
    expect((results[0] as RowParseError).reason).toBe('Unreadable date');
    expect(results[1]).toBeInstanceOf(RowParseError);
    expect(results[2]).toBeInstanceOf(RowParseError);
    expect(results[3]).toMatchObject({ merchantRaw: 'SHOP', amountMinor: 500, direction: 'out' });
  });

  it('flags a BAC detail header with other columns', () => {
    const lines = [
      'Número de Clientes, Nombre, Producto, Moneda, Fecha',
      '1, ANA, CR1, USD, 31/10/2026',
      '',
      'Detalle de Estado Bancario',
      'Fecha, Monto',
      '01/10/2026, 5.00',
    ];
    const data = parser.extract(lines, bacTransaccionesMes);
    expect(data.headerOk).toBe(false);
    expect(data.rows).toHaveLength(0);
  });
});

describe('KindResolver', () => {
  const r = new KindResolver();
  const own = ['CR00010200000123456781'];
  const holder = 'ANA MARIA PRUEBA SOLANO';
  it.each([
    ['out', 'TEF A : 123456781', 'transfer'],
    ['out', 'TEF A : 987654321', 'payment_sent'],
    ['out', 'SINPE MOVIL Gasolina', 'sinpe_sent'],
    ['out', 'DTR:inversiones_hapi_VT', 'payment_sent'],
    ['in', 'DTR SINPE ANA_MARIA_PRUEBA_SOL', 'transfer'],
    ['in', 'CD SINPE ANA_MARIA', 'sinpe_received'],
    ['in', 'CD SINPE 213585__', 'sinpe_received'],
    ['in', 'INTERESES', 'income'],
    ['out', 'AUTOMERCADO', 'purchase'],
    ['in', 'DEPOSITO', 'income'],
  ] as const)('%s %s → %s', (direction, merchantRaw, kind) => {
    expect(r.resolve({ direction, merchantRaw }, BAC_KIND_RULES, own, holder)).toBe(kind);
  });
  it('a transfer to an account the user did not register stays a payment', () => {
    expect(r.resolve({ direction: 'out', merchantRaw: 'TEF A : 123456781' }, BAC_KIND_RULES, [], holder)).toBe('payment_sent');
  });
});

describe('EmailTemplateParser', () => {
  const parser = new EmailTemplateParser();
  const bacText = (type: string, extra = '') =>
    `<p>Comercio: SPOTIFY Ciudad y país: SAN JOSE, Costa Rica Fecha: Nov 10, 2026, 09:05 MASTER: ************1111 Autorización: 1 Referencia: 22 Tipo de Transacción: ${type} Monto: USD 9.99 ${extra}</p>`;

  it('reads a refund as money in', () => {
    expect(parser.parseHtml(bacText('DEVOLUCIÓN'), bacNotificacion)).toMatchObject({
      kind: 'refund',
      direction: 'in',
      currency: 'USD',
      amountMinor: 999,
      merchantRaw: 'SPOTIFY',
    });
  });
  it('an unknown type is UNKNOWN_TYPE', () => {
    expect(() => parser.parseHtml(bacText('RETIRO'), bacNotificacion)).toThrow(new EmailParseError('UNKNOWN_TYPE:RETIRO'));
  });
  it('a missing field is FIELD_MISSING', () => {
    try {
      parser.parseHtml('<p>Comercio: X Ciudad y país: Y</p>', bacNotificacion);
      expect.unreachable();
    } catch (e) {
      expect((e as EmailParseError).reason).toBe('FIELD_MISSING:type');
    }
  });
  it('headerMessageId unfolds headers', () => {
    expect(headerMessageId('Subject: x\r\nMessage-Id: \r\n <abc@example.com>\r\n\r\nbody')).toBe('abc@example.com');
    expect(headerMessageId('Subject: x\r\n\r\nMessage-Id: <no@x>')).toBeNull();
  });
});
