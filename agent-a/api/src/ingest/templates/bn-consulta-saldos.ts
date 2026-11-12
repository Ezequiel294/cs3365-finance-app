import type { CsvTemplate } from './types';

/** Banco Nacional "Consulta de saldos" export (bank-formats.md section 2). */
export const bnConsultaSaldos: CsvTemplate = {
  id: 'bn-consulta-saldos',
  bank: 'BN',
  layout: 'table',
  delimiter: ';',
  header: ['oficina', 'fechamovimiento', 'numerodocumento', 'debito', 'credito', 'descripcion'],
  columns: {
    date: 'fechamovimiento',
    ref: 'numerodocumento',
    debit: 'debito',
    credit: 'credito',
    description: 'descripcion',
  },
  merchant: 'beforeLastSlash',
  currencySource: 'account',
  totalRow: { column: 'numerodocumento', value: 'TOTAL' },
  checksum: 'totalRow',
  kindRules: [], // defaults: out → purchase, in → income
};
