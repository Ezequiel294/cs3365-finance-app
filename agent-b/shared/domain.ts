export type Currency = 'USD' | 'CRC';
export type Bank = 'BAC' | 'BN';
export type TransactionKind = 'purchase'|'refund'|'income'|'sinpe_sent'|'sinpe_received'|'payment_sent'|'transfer'|'card_payment';
export type Flow = 'expense'|'refund'|'income'|'excluded';
export type AssetClass = 'SECURITY'|'CRYPTO'; export type InvestmentType = 'DEPOSIT'|'WITHDRAWAL'|'BUY'|'SELL';
export interface Account { id:string; name:string; bank:Bank; currency:Currency; iban?:string; cardLast4s:string[]; version:number }
export interface ParsedTransaction { accountId?:string; cardLast4?:string; localDate:string; occurredAt:string|null; direction:'out'|'in'; kind:TransactionKind; currency:Currency; amountMinor:number; merchantRaw:string; statementRef:string; bankCode?:string; authorization?:string; source:'csv'|'gmail'; sourceRef?:string; line?:number }
export interface Transaction extends ParsedTransaction { id:string; userId:string; amountUsdCents:number; fxRate:number; fxDate:string; categoryId?:string; tagIds:string[]; categorizedBy:'user'|'rule'|'global'|'none'; status:'confirmed'|'pending_review'; merchantKey:string; sources:('manual'|'csv'|'gmail')[]; version:number; possibleDuplicateOf?:string; reviewReason?:string }
export interface Fee { flatCents:number; percentBps:number } export interface FeeSchedule { deposit:Fee; withdrawal:Fee; buy:Record<AssetClass,Fee>; sell:Record<AssetClass,Fee> }
export interface Broker { id:string; name:string; fees:FeeSchedule; version:number }
export interface InvestmentTransaction { id:string; userId:string; brokerId:string; type:InvestmentType; localDate:string; ticker?:string; assetClass?:AssetClass; quantityMicro?:number; grossCents?:number; amountCents?:number; commissionCents:number; commissionSource:'rule'|'manual'; name?:string; version:number }
export interface Holding { brokerId:string;ticker:string;assetClass:AssetClass;name?:string;quantityMicro:number;costBasisCents:number;realizedGainCents:number;version:number }
export function flow(kind:TransactionKind):Flow { if (kind==='refund') return 'refund'; if (kind==='income'||kind==='sinpe_received') return 'income'; return kind==='purchase'||kind==='sinpe_sent'||kind==='payment_sent' ? 'expense':'excluded'; }
export function countsAsSpending(kind:TransactionKind) { const f=flow(kind); return f==='expense'||f==='refund'; }
