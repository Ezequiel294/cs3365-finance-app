import "server-only";
import { redirect } from "next/navigation";
import { ApiError, apiClient, type ApiClient } from "./api-client";
import { sessionService } from "./session";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; status?: number };

/**
 * Runs one API call for a Server Action or loader: reads the session first, then returns data or a
 * readable error. A 401 from the API sends the user back to sign-in.
 */
export async function withApi<T>(fn: (api: ApiClient, token: string) => Promise<T>): Promise<Result<T>> {
  const token = await sessionService.requireIdToken();
  try {
    return { ok: true, data: await fn(apiClient(), token) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) redirect("/signin");
      return { ok: false, error: error.message, code: error.code, status: error.status };
    }
    throw error;
  }
}

/** Like withApi, but throws on failure (for page loaders that cannot render without the data). */
export async function load<T>(fn: (api: ApiClient, token: string) => Promise<T>): Promise<T> {
  const result = await withApi(fn);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
