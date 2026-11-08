"use server";

import { refresh } from "next/cache";
import {
  BrokerRule,
  InvestmentChanges,
  NewInvestmentTransaction,
  type Broker,
  type Holding,
  type InvestmentTransaction,
  type Liquidation,
  type Valuation,
} from "@finance/shared";
import { withApi, type Result } from "@/lib/result";

type Recorded = { transaction: InvestmentTransaction; holding?: Holding };

/** InvestmentActions: record and correct investment transactions, broker rules, valuation, liquidation. */
export async function recordInvestment(input: unknown): Promise<Result<Recorded>> {
  const parsed = NewInvestmentTransaction.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  const result = await withApi((api, token) => api.post<Recorded>("/api/investments/transactions", parsed.data, token));
  if (result.ok) refresh();
  return result;
}

export async function correctInvestment(id: string, changes: unknown): Promise<Result<Recorded>> {
  const parsed = InvestmentChanges.safeParse(changes);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the change" };
  const result = await withApi((api, token) => api.patch<Recorded>(`/api/investments/transactions/${encodeURIComponent(id)}`, parsed.data, token));
  if (result.ok) refresh();
  return result;
}

export async function updateBroker(id: string, rule: unknown): Promise<Result<Broker>> {
  const parsed = BrokerRule.safeParse(rule);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the commission" };
  const result = await withApi((api, token) => api.put<Broker>(`/api/brokers/${encodeURIComponent(id)}`, parsed.data, token));
  if (result.ok) refresh();
  return result;
}

export async function listBrokers(): Promise<Result<Broker[]>> {
  return withApi(async (api, token) => (await api.get<{ items: Broker[] }>("/api/brokers", token)).items);
}

export async function listInvestments(): Promise<Result<InvestmentTransaction[]>> {
  return withApi(async (api, token) => (await api.get<{ items: InvestmentTransaction[] }>("/api/investments/transactions", token)).items);
}

export async function getValuation(): Promise<Result<Valuation>> {
  return withApi((api, token) => api.get<Valuation>("/api/portfolio/valuation", token));
}

export async function getLiquidation(): Promise<Result<Liquidation>> {
  return withApi((api, token) => api.get<Liquidation>("/api/portfolio/liquidation", token));
}
