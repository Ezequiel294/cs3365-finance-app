'use server';

import type {
  Broker,
  FeeSchedule,
  InvestmentChangesInput,
  InvestmentTransaction,
  Liquidation,
  NewInvestmentInput,
  Quote,
  Valuation,
} from '@finance/shared';
import { act, api } from '@/lib/api-client';
import { SessionService } from '@/lib/session';

const token = () => SessionService.requireIdToken({ canSetCookies: true });

export interface RecordResult {
  transaction: InvestmentTransaction;
  holding: { quantityMicro: number; costBasisCents: number } | null;
  cashDeltaCents: number;
}

/** InvestmentActions (class diagram section 2). */
export async function recordInvestment(input: NewInvestmentInput) {
  return act(async () => api.post<RecordResult>('/api/investments/transactions', input, await token()));
}

export async function correctInvestment(id: string, changes: InvestmentChangesInput) {
  return act(async () => api.patch<RecordResult>(`/api/investments/transactions/${encodeURIComponent(id)}`, changes, await token()));
}

export async function listInvestments() {
  return act(async () => api.get<InvestmentTransaction[]>('/api/investments/transactions', await token()));
}

export async function listBrokers() {
  return act(async () => api.get<Broker[]>('/api/brokers', await token()));
}

export async function createBroker(name: string, fees: FeeSchedule) {
  return act(async () => api.post<Broker>('/api/brokers', { name, fees }, await token()));
}

export async function updateBroker(id: string, fees: FeeSchedule, version: number) {
  return act(async () => api.put<Broker>(`/api/brokers/${encodeURIComponent(id)}`, { fees, version }, await token()));
}

export async function quote(ticker: string) {
  return act(async () => api.get<Quote>(`/api/portfolio/quote?ticker=${encodeURIComponent(ticker)}`, await token()));
}

export async function getValuation() {
  return act(async () => api.get<Valuation>('/api/portfolio/valuation', await token()));
}

export async function getLiquidation() {
  return act(async () => api.get<Liquidation>('/api/portfolio/liquidation', await token()));
}
