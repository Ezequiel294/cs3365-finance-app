import 'server-only';
import type { ApiErrorBody } from '@finance/shared';
import { config } from './config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Typed calls from the Next.js server to `ApiFn`, with the user's ID token as a bearer token. */
export class ApiClient {
  constructor(private readonly baseUrl: string = config.apiUrl) {}

  private async request<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
    if (!this.baseUrl) throw new ApiError(500, 'CONFIG', 'API_URL is not configured');
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = (json ?? {}) as Partial<ApiErrorBody> & { message?: string };
      throw new ApiError(res.status, err.code ?? 'HTTP_' + res.status, err.message ?? res.statusText, err.details);
    }
    return json as T;
  }

  get<T>(path: string, token: string) {
    return this.request<T>('GET', path, token);
  }
  post<T>(path: string, body: unknown, token: string) {
    return this.request<T>('POST', path, token, body);
  }
  patch<T>(path: string, body: unknown, token: string) {
    return this.request<T>('PATCH', path, token, body);
  }
  put<T>(path: string, body: unknown, token: string) {
    return this.request<T>('PUT', path, token, body);
  }
  delete<T>(path: string, token: string) {
    return this.request<T>('DELETE', path, token);
  }
}

export const api = new ApiClient();

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number; details?: Record<string, unknown> };

/** Runs a Server Action body and turns API errors into a result the page can show. */
export async function act<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message, status: err.status, details: err.details };
    // redirect() and notFound() must propagate
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    return { ok: false, error: 'Something went wrong. Try again.' };
  }
}
