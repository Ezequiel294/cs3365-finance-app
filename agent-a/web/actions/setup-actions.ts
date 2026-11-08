"use server";

import { refresh } from "next/cache";
import { NewAccount, NewLabel, SettingsInput, type Account, type Category, type ReferenceData, type Tag, type UserSettings } from "@finance/shared";
import { withApi, type Result } from "@/lib/result";

/** Supporting setup: accounts, the user's own categories and tags, and profile settings. */
export async function getReference(): Promise<Result<ReferenceData>> {
  return withApi((api, token) => api.get<ReferenceData>("/api/reference", token));
}

export async function createAccount(input: unknown): Promise<Result<Account>> {
  const parsed = NewAccount.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the account" };
  const result = await withApi((api, token) => api.post<Account>("/api/accounts", parsed.data, token));
  if (result.ok) refresh();
  return result;
}

export async function createLabel(kind: "category" | "tag", name: string): Promise<Result<Category | Tag>> {
  const parsed = NewLabel.safeParse({ name });
  if (!parsed.success) return { ok: false, error: "Enter a name" };
  const result = await withApi((api, token) => api.post<Category | Tag>(kind === "category" ? "/api/categories" : "/api/tags", parsed.data, token));
  if (result.ok) refresh();
  return result;
}

export async function getSettings(): Promise<Result<UserSettings>> {
  return withApi((api, token) => api.get<UserSettings>("/api/settings", token));
}

export async function saveSettings(input: unknown): Promise<Result<UserSettings>> {
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settings" };
  const result = await withApi((api, token) => api.put<UserSettings>("/api/settings", parsed.data, token));
  if (result.ok) refresh();
  return result;
}
