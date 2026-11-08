import "server-only";
import type { ApiErrorBody } from "@finance/shared";
import { serverConfig } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Typed calls from the Next.js server to ApiFn, with the user's ID token as a bearer token. */
export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  get<T>(path: string, token: string): Promise<T> {
    return this.request<T>("GET", path, token);
  }
  post<T>(path: string, body: unknown, token: string): Promise<T> {
    return this.request<T>("POST", path, token, body);
  }
  patch<T>(path: string, body: unknown, token: string): Promise<T> {
    return this.request<T>("PATCH", path, token, body);
  }
  put<T>(path: string, body: unknown, token: string): Promise<T> {
    return this.request<T>("PUT", path, token, body);
  }
  delete<T>(path: string, token: string): Promise<T> {
    return this.request<T>("DELETE", path, token);
  }

  /** Forwards a request unchanged (used by the `/api/*` route handler). */
  async raw(method: string, path: string, token: string, body?: string, contentType?: string): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": contentType ?? "application/json" } : {}) },
      body,
      cache: "no-store",
    });
  }

  private async request<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    const json = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const err = (json ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(res.status, err.code ?? "HTTP_ERROR", err.message ?? (res.status === 401 ? "Please sign in again" : "The request failed"));
    }
    return json as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

let client: ApiClient | undefined;
export function apiClient(): ApiClient {
  client ??= new ApiClient(serverConfig().apiUrl);
  return client;
}
