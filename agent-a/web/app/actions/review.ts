'use server';

import type { IngestResult, ReviewList, Rule, TransactionKind } from '@finance/shared';
import { act, api } from '@/lib/api-client';
import { SessionService } from '@/lib/session';

const token = () => SessionService.requireIdToken({ canSetCookies: true });

/** ReviewActions (class diagram section 2). */
export async function listReview() {
  return act(async () => api.get<ReviewList>('/api/review', await token()));
}

export async function mergeDuplicate(keepId: string, dropId: string) {
  return act(async () => api.post('/api/review/duplicates/merge', { keepId, dropId }, await token()));
}

export async function dismissDuplicate(id: string) {
  return act(async () => api.post('/api/review/duplicates/dismiss', { id }, await token()));
}

export async function retryMessage(messageId: string) {
  return act(async () => api.post<IngestResult>(`/api/review/messages/${encodeURIComponent(messageId)}/retry`, {}, await token()));
}

export async function saveRule(merchantKey: string, categoryId: string | null, tagIds: string[], kind?: TransactionKind | null) {
  return act(async () =>
    api.put<Rule>(`/api/rules/${encodeURIComponent(merchantKey)}`, { categoryId, tagIds, kind: kind ?? null }, await token()),
  );
}
