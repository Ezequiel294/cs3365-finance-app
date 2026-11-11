import type { EmailTemplate } from './types';

/** Banco Nacional "Voucher Digital" card alert (bank-formats.md section 6b). */
export const bnVoucherDigital: EmailTemplate = {
  id: 'bn-voucher-digital',
  bank: 'BN',
  senders: ['bncontacto@bncr.fi.cr'],
  subject: /^Voucher Digital$/,
  dkimDomain: 'bncr.fi.cr',
  fields: {
    typeAndMerchant: /comprobante de (\S+) realizada en (.+?) el \d{1,2} de/,
    dateTime: /(\w{3}) (\d{1,2}), (\d{4}) - (\d{1,2}):(\d{2}) ([ap])\.m\./,
    cardLast4: /\b(?:VISA|MASTER(?:CARD)?|AMEX)\s*\*{4,}(\d{4})/,
    authorization: /NRO\. AUT:\s*(\d+)/,
    reference: /REF:\s*(\d+)/,
    amount: /TOTAL:\s*(CRC|USD)\s*([\d.,]+)/,
  },
  clock: '12h',
  typeMap: { COMPRA: 'purchase' },
};
