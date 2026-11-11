'use server';

import type { Category, NewTransactionInput, Tag, Transaction, TransactionChangesInput } from '@finance/shared';
import { act, api } from '@/lib/api-client';
import { SessionService } from '@/lib/session';

const token = () => SessionService.requireIdToken({ canSetCookies: true });

/** TransactionActions (class diagram section 2). */
export async function createTransaction(input: NewTransactionInput) {
  return act(async () => api.post<Transaction>('/api/transactions', input, await token()));
}

export async function updateTransaction(id: string, changes: TransactionChangesInput) {
  return act(async () => api.patch<Transaction>(`/api/transactions/${encodeURIComponent(id)}`, changes, await token()));
}

export async function listTransactions(from: string, to: string) {
  return act(async () => api.get<Transaction[]>(`/api/transactions?from=${from}&to=${to}`, await token()));
}

export async function createCategory(name: string) {
  return act(async () => api.post<Category>('/api/categories', { name }, await token()));
}

export async function createTag(name: string) {
  return act(async () => api.post<Tag>('/api/tags', { name }, await token()));
}

export async function saveSettings(weekStart: string, timeZone: string) {
  return act(async () => api.put('/api/settings', { weekStart, timeZone }, await token()));
}
