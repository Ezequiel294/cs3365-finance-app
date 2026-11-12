import type { EmailTemplate } from './types';

/** BAC Credomatic card alert (bank-formats.md section 6a). */
export const bacNotificacion: EmailTemplate = {
  id: 'bac-notificacion',
  bank: 'BAC',
  senders: ['notificacionbac@baccredomatic.cr'],
  subject: /^Notificaci[oó]n de transacci[oó]n /,
  dkimDomain: 'baccredomatic.cr',
  fields: {
    merchant: /Comercio:\s*(.+?)\s*Ciudad y país:/,
    dateTime: /Fecha:\s*(\w{3}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2})/,
    cardLast4: /\b[A-Z]+:\s*\*{4,}(\d{4})/,
    authorization: /Autorización:\s*(\d+)/,
    reference: /Referencia:\s*(\d+)/,
    type: /Tipo de Transacción:\s*(.+?)\s+Monto:/,
    amount: /Monto:\s*(CRC|USD)\s*([\d.,]+)/,
  },
  clock: '24h',
  typeMap: { COMPRA: 'purchase', DEVOLUCION: 'refund' },
};
