'use server';

import type { ImportJob, ImportStart } from '@finance/shared';
import { act, api } from '@/lib/api-client';
import { SessionService } from '@/lib/session';

const token = () => SessionService.requireIdToken({ canSetCookies: true });

/** ImportActions: start an import (presigned upload form) and poll its status. */
export async function startImport(accountId: string, fileName: string, sha256: string, size: number) {
  return act(async () => api.post<ImportStart>('/api/imports', { accountId, fileName, sha256, size }, await token()));
}

export async function getImport(id: string) {
  return act(async () => api.get<ImportJob>(`/api/imports/${encodeURIComponent(id)}`, await token()));
}
