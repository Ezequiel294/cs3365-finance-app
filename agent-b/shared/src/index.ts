import { z } from 'zod';

export const CurrencySchema = z.enum(['USD', 'CRC']);
export const TransactionKindSchema = z.enum(['purchase','refund','income','sinpe_sent','sinpe_received','transfer','card_payment']);
export const TransactionSourceSchema = z.enum(['manual','gmail','csv']);
const cents = z.number().int().nonnegative();
export const NewTransactionSchema = z.object({ accountId:z.string().min(1), localDate:z.string().date(), occurredAt:z.string().datetime().optional(), kind:TransactionKindSchema, currency:CurrencySchema, amountMinor:cents.positive(), merchantRaw:z.string().max(200).optional().default(''), categoryId:z.string().optional(), tagIds:z.array(z.string()).max(20).default([]), statementRef:z.string().max(200).optional() });
export const TransactionChangesSchema = NewTransactionSchema.partial().extend({version:z.number().int().nonnegative()});
export const NewImportSchema = z.object({accountId:z.string().min(1),fileName:z.string().max(200),sha256:z.string().regex(/^[a-f0-9]{64}$/i)});
export const RuleInputSchema = z.object({categoryId:z.string().min(1),tagIds:z.array(z.string()).max(20).default([])});
export const BudgetPeriodSchema = z.enum(['WEEKLY','MONTHLY','QUARTERLY','YEARLY','CUSTOM']);
const BudgetInputSchema = z.object({name:z.string().min(1).max(100),categoryIds:z.array(z.string()).max(20).default([]),tagIds:z.array(z.string()).max(20).default([]),period:BudgetPeriodSchema,limitCents:cents, startDate:z.string().date(),endDate:z.string().date().optional()});
export const NewBudgetSchema = BudgetInputSchema.refine(v=>v.categoryIds.length+v.tagIds.length>0,{message:'A budget needs a category or tag'});
export const BudgetChangesSchema = BudgetInputSchema.partial().extend({version:z.number().int().nonnegative()});
export const InvestmentTypeSchema=z.enum(['DEPOSIT','WITHDRAWAL','BUY','SELL']);
export const NewInvestmentTransactionSchema=z.object({brokerId:z.string().min(1),type:InvestmentTypeSchema,localDate:z.string().date(),ticker:z.string().trim().toUpperCase().optional(),quantityMicro:z.number().int().positive().optional(),grossCents:cents.optional(),amountCents:cents.optional(),commissionCents:cents.default(0),name:z.string().max(120).optional()}).superRefine((v,c)=>{if(['BUY','SELL'].includes(v.type)&&(!v.ticker||!v.quantityMicro||v.grossCents===undefined))c.addIssue({code:'custom',message:'Trades require ticker, quantityMicro, and grossCents'});if(['DEPOSIT','WITHDRAWAL'].includes(v.type)&&v.amountCents===undefined)c.addIssue({code:'custom',message:'Cash movements require amountCents'});});
export const BrokerRuleSchema=z.object({flatCents:cents,percentBps:cents,version:z.number().int().nonnegative()});
export const ParsedRowSchema=z.object({accountLast4:z.string().regex(/^\d{4}$/),localDate:z.string().date(),occurredAt:z.string().datetime().optional(),kind:TransactionKindSchema,currency:CurrencySchema,amountMinor:cents.positive(),merchantRaw:z.string().min(1),statementRef:z.string().optional(),source:TransactionSourceSchema,sourceRef:z.string().optional()});
export type NewTransaction=z.infer<typeof NewTransactionSchema>; export type TransactionChanges=z.infer<typeof TransactionChangesSchema>; export type NewBudget=z.infer<typeof NewBudgetSchema>; export type NewInvestmentTransaction=z.infer<typeof NewInvestmentTransactionSchema>; export type ParsedTransaction=z.infer<typeof ParsedRowSchema>;
