import type { CsvTemplate, KindRule } from './types';

/** Kind rules for BAC statement rows, first match wins (bank-formats.md section 4). */
export const BAC_KIND_RULES: KindRule[] = [
  { direction: 'out', pattern: /^TEF A\s*:\s*(\d+)/, when: 'ownAccount', kind: 'transfer' },
  { direction: 'out', pattern: /^TEF A\s*:/, kind: 'payment_sent' },
  { direction: 'out', pattern: /^SINPE MOVIL/, kind: 'sinpe_sent' },
  { direction: 'out', pattern: /^DTR:/, kind: 'payment_sent' },
  { direction: 'in', pattern: /^(?:DTR|CD) SINPE\s+(.+)/, when: 'holderName', kind: 'transfer' },
  { direction: 'in', pattern: /^(?:DTR|CD) SINPE/, kind: 'sinpe_received' },
  { direction: 'in', pattern: /^INTERESES/, kind: 'income' },
];

/** BAC Credomatic "Transacciones del mes" statement export (bank-formats.md section 3). */
export const bacTransaccionesMes: CsvTemplate = {
  id: 'bac-transacciones-mes',
  bank: 'BAC',
  layout: 'sectioned',
  delimiter: ',',
  preamble: {
    header: ['numero de clientes', 'nombre', 'producto', 'moneda'],
    fields: { holderName: 'nombre', iban: 'producto', currency: 'moneda', statementDate: 'fecha' },
  },
  detailMarker: 'detalle de estado bancario',
  header: [
    'fecha de transaccion',
    'referencia de transaccion',
    'codigo de transaccion',
    'descripcion de transaccion',
    'debito de transaccion',
    'credito de transaccion',
    'balance de transaccion',
  ],
  columns: {
    date: 'fecha de transaccion',
    ref: 'referencia de transaccion',
    code: 'codigo de transaccion',
    description: 'descripcion de transaccion',
    debit: 'debito de transaccion',
    credit: 'credito de transaccion',
  },
  merchant: 'description',
  currencySource: 'preamble',
  checksum: 'summaryTotalLine',
  kindRules: BAC_KIND_RULES,
};
