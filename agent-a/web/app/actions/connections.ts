'use server';

import type { ConnectionView, GmailSetup } from '@finance/shared';
import { act, api } from '@/lib/api-client';
import { SessionService } from '@/lib/session';

const token = () => SessionService.requireIdToken({ canSetCookies: true });

/** ConnectionActions (class diagram section 2). */
export async function connectGmail() {
  return act(async () => api.post<GmailSetup>('/api/connections/gmail', {}, await token()));
}

export async function listConnections() {
  return act(async () => api.get<ConnectionView[]>('/api/connections', await token()));
}

export async function rotateGmail(id: string) {
  return act(async () => api.post<GmailSetup>(`/api/connections/gmail/${encodeURIComponent(id)}/rotate`, {}, await token()));
}

export async function revokeConnection(id: string) {
  return act(async () => api.delete(`/api/connections/${encodeURIComponent(id)}`, await token()));
}
