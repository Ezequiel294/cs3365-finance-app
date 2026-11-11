import { NextResponse, type NextRequest } from 'next/server';
import { SessionService } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Refreshes an expired ID token (pages cannot set cookies while rendering), then goes back. */
export async function GET(request: NextRequest) {
  const nextParam = request.nextUrl.searchParams.get('next') ?? '/dashboard';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard';
  const session = await SessionService.getSession();
  const refreshed = session ? await SessionService.refresh(session) : null;
  const target = refreshed ? next : `/login?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(target, publicOrigin(request)), 303);
}

/** The browser-facing origin (behind CloudFront the Host header can differ). */
function publicOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  return `${proto}://${host}`;
}
