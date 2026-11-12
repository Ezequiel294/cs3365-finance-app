'use server';
import type { Liquidation, Quote, RecordInvestmentResult, Valuation } from '@/shared/api-types';
import { BrokerFees, InvestmentChanges, NewBroker, NewInvestmentTransaction, Ticker, zodFields } from '@/shared/schemas';
import type { Broker, FeeSchedule, InvestmentMonthRollup, InvestmentTransaction } from '@/shared/types';
import { failure, type ActionResult } from '../lib/result';
import { call, enc } from './call';

export async function recordInvestment(input: unknown): Promise<ActionResult<RecordInvestmentResult>> {
  const parsed = NewInvestmentTransaction.safeParse(input);
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<RecordInvestmentResult>('post', '/api/investments/transactions', parsed.data);
}

export async function correctInvestment(id: string, changes: unknown): Promise<ActionResult<InvestmentTransaction>> {
  const parsed = InvestmentChanges.safeParse(changes);
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<InvestmentTransaction>('patch', `/api/investments/transactions/${enc(id)}`, parsed.data);
}

export async function listInvestments(): Promise<ActionResult<InvestmentTransaction[]>> {
  return call<InvestmentTransaction[]>('get', '/api/investments/transactions');
}

export async function listBrokers(): Promise<ActionResult<Broker[]>> {
  return call<Broker[]>('get', '/api/brokers');
}

export async function createBroker(name: string, fees: FeeSchedule): Promise<ActionResult<Broker>> {
  const parsed = NewBroker.safeParse({ name, fees });
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<Broker>('post', '/api/brokers', parsed.data);
}

export async function updateBroker(id: string, fees: FeeSchedule, version: number): Promise<ActionResult<Broker>> {
  const parsed = BrokerFees.safeParse({ fees, version });
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<Broker>('put', `/api/brokers/${enc(id)}`, parsed.data);
}

export async function quote(ticker: string): Promise<ActionResult<Quote>> {
  const parsed = Ticker.safeParse(ticker);
  if (!parsed.success) return failure('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid ticker');
  return call<Quote>('get', `/api/portfolio/quote?ticker=${enc(parsed.data)}`);
}

export async function getValuation(): Promise<ActionResult<Valuation>> {
  return call<Valuation>('get', '/api/portfolio/valuation');
}

export async function getLiquidation(): Promise<ActionResult<Liquidation>> {
  return call<Liquidation>('get', '/api/portfolio/liquidation');
}

export async function getFlows(months: number): Promise<ActionResult<InvestmentMonthRollup[]>> {
  return call<InvestmentMonthRollup[]>('get', `/api/investments/flows?months=${months}`);
}
