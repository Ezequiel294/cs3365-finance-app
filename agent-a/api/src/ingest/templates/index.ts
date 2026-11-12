import { bacNotificacion } from './bac-notificacion';
import { bacTransaccionesMes } from './bac-transacciones-mes';
import { bnConsultaSaldos } from './bn-consulta-saldos';
import { bnVoucherDigital } from './bn-voucher-digital';
import type { CsvTemplate, EmailTemplate } from './types';

export const CSV_TEMPLATES: CsvTemplate[] = [bnConsultaSaldos, bacTransaccionesMes];
export const EMAIL_TEMPLATES: EmailTemplate[] = [bacNotificacion, bnVoucherDigital];

export { bacNotificacion, bacTransaccionesMes, bnConsultaSaldos, bnVoucherDigital };
export type * from './types';
