"use server";

import { NewImport, type ImportJob, type ImportStart } from "@finance/shared";
import { withApi, type Result } from "@/lib/result";

/** ImportActions: starts a CSV import (the browser then uploads straight to S3) and polls its status. */
export async function startImport(accountId: string, fileName: string, sha256: string): Promise<Result<ImportStart>> {
  const parsed = NewImport.safeParse({ accountId, fileName, sha256 });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the file" };
  return withApi((api, token) => api.post<ImportStart>("/api/imports", parsed.data, token));
}

export async function getImport(id: string): Promise<Result<ImportJob>> {
  return withApi((api, token) => api.get<ImportJob>(`/api/imports/${encodeURIComponent(id)}`, token));
}
