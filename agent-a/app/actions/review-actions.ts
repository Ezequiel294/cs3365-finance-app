'use server';
import type { IngestResult, ReviewList } from '@/shared/api-types';
import { RuleInput, zodFields } from '@/shared/schemas';
import type { Rule, TransactionKind } from '@/shared/types';
import { failure, type ActionResult } from '../lib/result';
import { call, enc } from './call';

export async function listReview(): Promise<ActionResult<ReviewList>> {
  return call<ReviewList>('get', '/api/review');
}

export async function mergeDuplicate(keepId: string, dropId: string): Promise<ActionResult<unknown>> {
  return call('post', '/api/review/duplicates/merge', { keepId, dropId });
}

export async function dismissDuplicate(id: string): Promise<ActionResult<unknown>> {
  return call('post', '/api/review/duplicates/dismiss', { id });
}

export async function retryMessage(messageId: string): Promise<ActionResult<IngestResult>> {
  return call<IngestResult>('post', `/api/review/messages/${enc(messageId)}/retry`, {});
}

export async function saveRule(
  merchantKey: string,
  categoryId: string | null,
  tagIds: string[],
  kind: TransactionKind | null,
): Promise<ActionResult<Rule>> {
  const parsed = RuleInput.safeParse({ categoryId, tagIds, kind });
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Invalid rule.', zodFields(parsed.error));
  return call<Rule>('put', `/api/rules/${enc(merchantKey)}`, parsed.data);
}
