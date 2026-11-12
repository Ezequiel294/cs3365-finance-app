import 'server-only';
import type { ApiErrorBody } from '@/shared/api-types';
import type { ActionResult } from './result';

/**
 * Calls ApiFn through API Gateway with the user's ID token as a bearer token. Request and
 * response types come from shared/, so the UI and the API agree on the contract.
 */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.API_URL ?? '') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  get<T>(path: string, token: string) {
    return this.send<T>('GET', path, undefined, token);
  }
  post<T>(path: string, body: unknown, token: string) {
    return this.send<T>('POST', path, body, token);
  }
  patch<T>(path: string, body: unknown, token: string) {
    return this.send<T>('PATCH', path, body, token);
  }
  put<T>(path: string, body: unknown, token: string) {
    return this.send<T>('PUT', path, body, token);
  }
  delete<T>(path: string, token: string) {
    return this.send<T>('DELETE', path, undefined, token);
  }

  private async send<T>(method: string, path: string, body: unknown, token: string): Promise<ActionResult<T>> {
    if (!this.baseUrl) return { ok: false, code: 'NOT_CONFIGURED', message: 'The app is not connected to its API yet.' };
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      return { ok: false, code: 'NETWORK', message: 'The app could not be reached. Try again in a moment.' };
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (res.ok) return { ok: true, data: json as T };
    const err = (json ?? {}) as Partial<ApiErrorBody> & { message?: string };
    if (res.status === 401) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Your session ended. Sign in again.', status: 401 };
    }
    return {
      ok: false,
      code: err.code ?? `HTTP_${res.status}`,
      message: err.message ?? 'Something went wrong. Try again in a moment.',
      fields: err.fields,
      details: err.details,
      status: res.status,
    };
  }
}

export const api = new ApiClient();
