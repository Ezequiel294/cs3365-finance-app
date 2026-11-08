"use server";

import { refresh } from "next/cache";
import { NewTransaction, TransactionChanges, type Transaction } from "@finance/shared";
import { withApi, type Result } from "@/lib/result";

/** TransactionActions from the class diagram: the UI controllers for manual entry and edits. */
export async function createTransaction(input: unknown): Promise<Result<Transaction>> {
  const parsed = NewTransaction.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  const result = await withApi((api, token) => api.post<Transaction>("/api/transactions", parsed.data, token));
  if (result.ok) refresh();
  return result;
}

export async function updateTransaction(id: string, changes: unknown): Promise<Result<Transaction>> {
  const parsed = TransactionChanges.safeParse(changes);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the change" };
  const result = await withApi((api, token) => api.patch<Transaction>(`/api/transactions/${encodeURIComponent(id)}`, parsed.data, token));
  if (result.ok) refresh();
  return result;
}

export async function listTransactions(from: string, to: string): Promise<Result<Transaction[]>> {
  const q = new URLSearchParams({ from, to });
  return withApi(async (api, token) => (await api.get<{ items: Transaction[] }>(`/api/transactions?${q}`, token)).items);
}
