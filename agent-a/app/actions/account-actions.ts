'use server';
import { AccountChanges, NewAccount, zodFields } from '@/shared/schemas';
import type { Account } from '@/shared/types';
import { failure, type ActionResult } from '../lib/result';
import { call, enc } from './call';

export async function listAccounts(): Promise<ActionResult<Account[]>> {
  return call<Account[]>('get', '/api/accounts');
}

export async function createAccount(input: unknown): Promise<ActionResult<Account>> {
  const parsed = NewAccount.safeParse(input);
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<Account>('post', '/api/accounts', parsed.data);
}

export async function updateAccount(id: string, changes: unknown): Promise<ActionResult<Account>> {
  const parsed = AccountChanges.safeParse(changes);
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<Account>('patch', `/api/accounts/${enc(id)}`, parsed.data);
}
