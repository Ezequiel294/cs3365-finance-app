"use server";

import { refresh } from "next/cache";
import type { Connection, GmailSetup } from "@finance/shared";
import { withApi, type Result } from "@/lib/result";

/** ConnectionActions: connect, list, rotate, and revoke the Gmail connection. */
export async function connectGmail(): Promise<Result<GmailSetup>> {
  return withApi((api, token) => api.post<GmailSetup>("/api/connections/gmail", {}, token));
}

export async function listConnections(): Promise<Result<Connection[]>> {
  return withApi(async (api, token) => (await api.get<{ items: Connection[] }>("/api/connections", token)).items);
}

export async function rotateGmail(id: string): Promise<Result<GmailSetup>> {
  return withApi((api, token) => api.post<GmailSetup>(`/api/connections/gmail/${encodeURIComponent(id)}/rotate`, {}, token));
}

export async function revokeConnection(id: string): Promise<Result<unknown>> {
  const result = await withApi((api, token) => api.delete(`/api/connections/${encodeURIComponent(id)}`, token));
  if (result.ok) refresh();
  return result;
}

/** Refreshes the page after the one-time token has been copied. */
export async function finishSetup(): Promise<void> {
  refresh();
}
