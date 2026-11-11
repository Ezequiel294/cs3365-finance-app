'use server';

import type { Account, AccountChangesInput, NewAccountInput } from '@finance/shared';
import { act, api } from '@/lib/api-client';
import { SessionService } from '@/lib/session';

const token = () => SessionService.requireIdToken({ canSetCookies: true });

/** AccountActions (class diagram section 2). */
export async function listAccounts() {
  return act(async () => api.get<Account[]>('/api/accounts', await token()));
}

export async function createAccount(input: NewAccountInput) {
  return act(async () => api.post<Account>('/api/accounts', input, await token()));
}

export async function updateAccount(id: string, changes: AccountChangesInput) {
  return act(async () => api.patch<Account>(`/api/accounts/${encodeURIComponent(id)}`, changes, await token()));
}
