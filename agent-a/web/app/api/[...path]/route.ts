import { type NextRequest } from "next/server";
import { apiClient } from "@/lib/api-client";
import { sessionService } from "@/lib/session";

/**
 * `/api/*` on the web origin forwards to ApiFn with the session's ID token. Without a session it
 * answers 401 itself, like API Gateway's JWT authorizer does, so the browser never holds a token.
 */
async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await sessionService.getSession();
  if (!session) return Response.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  let token = session.idToken;
  if (!token || session.expiresAt - 60_000 < Date.now()) {
    try {
      token = (await sessionService.refresh(session)).idToken;
    } catch {
      return Response.json({ code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
    }
  }
  const { path } = await params;
  if (path.some((p) => p === ".." || p.includes("/"))) return Response.json({ code: "NOT_FOUND", message: "Not found" }, { status: 404 });
  const target = `/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const body = request.method === "GET" || request.method === "DELETE" ? undefined : await request.text();
  const upstream = await apiClient().raw(request.method, target, token, body, request.headers.get("content-type") ?? undefined);
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
