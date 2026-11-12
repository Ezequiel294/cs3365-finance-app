'use server';
import { NewTransaction, TransactionChanges, zodFields } from '@/shared/schemas';
import type { Transaction } from '@/shared/types';
import { failure, type ActionResult } from '../lib/result';
import { call, enc } from './call';

export async function createTransaction(input: unknown): Promise<ActionResult<Transaction>> {
  const parsed = NewTransaction.safeParse(input);
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<Transaction>('post', '/api/transactions', parsed.data);
}

export async function updateTransaction(id: string, changes: unknown): Promise<ActionResult<Transaction>> {
  const parsed = TransactionChanges.safeParse(changes);
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<Transaction>('patch', `/api/transactions/${enc(id)}`, parsed.data);
}

export async function listTransactions(from: string, to: string): Promise<ActionResult<Transaction[]>> {
  return call<Transaction[]>('get', `/api/transactions?from=${enc(from)}&to=${enc(to)}`);
}
