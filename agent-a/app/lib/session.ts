import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type Tokens, decodeIdToken, refreshTokens, revokeRefreshToken } from './cognito';

export interface Session {
  userId: string;
  email?: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const ID = 'fa_id';
const REFRESH = 'fa_rt';
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Keeps the Cognito tokens in HttpOnly, SameSite=Strict cookies and hands the ID token to
 * ApiClient, so browser JavaScript never sees it.
 */
export const SessionService = {
  async getSession(store?: CookieStore): Promise<Session | null> {
    const jar = store ?? (await cookies());
    const idToken = jar.get(ID)?.value;
    const refreshToken = jar.get(REFRESH)?.value;
    const claims = idToken ? decodeIdToken(idToken) : null;
    const now = Math.floor(Date.now() / 1000);
    if (idToken && claims && claims.exp - 60 > now) {
      return { userId: claims.sub, email: claims.email, idToken, refreshToken, expiresAt: claims.exp };
    }
    if (!refreshToken) return null;
    try {
      return await SessionService.refresh({ userId: claims?.sub ?? '', idToken: idToken ?? '', refreshToken, expiresAt: 0 }, jar);
    } catch {
      return null;
    }
  },

  async requireIdToken(): Promise<string> {
    const s = await SessionService.getSession();
    if (!s) redirect('/sign-in');
    return s.idToken;
  },

  async requireSession(): Promise<Session> {
    const s = await SessionService.getSession();
    if (!s) redirect('/sign-in');
    return s;
  },

  async refresh(session: Session, store?: CookieStore): Promise<Session> {
    const tokens = await refreshTokens(session.refreshToken!);
    const next = toSession(tokens);
    // Cookies can only be written from Server Actions and Route Handlers; while a page
    // renders, the refreshed token is used for this request only.
    try {
      SessionService.store(tokens, store ?? (await cookies()));
    } catch {
      /* rendering a Server Component */
    }
    return next;
  },

  store(tokens: Tokens, jar: CookieStore): void {
    jar.set(ID, tokens.idToken, { ...cookieOptions, maxAge: tokens.expiresIn });
    if (tokens.refreshToken) jar.set(REFRESH, tokens.refreshToken, { ...cookieOptions, maxAge: 30 * 86400 });
  },

  async signOut(): Promise<void> {
    const jar = await cookies();
    const refreshToken = jar.get(REFRESH)?.value;
    jar.delete(ID);
    jar.delete(REFRESH);
    if (refreshToken) await revokeRefreshToken(refreshToken);
  },
};

function toSession(tokens: Tokens): Session {
  const claims = decodeIdToken(tokens.idToken);
  return {
    userId: claims?.sub ?? '',
    email: claims?.email,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    expiresAt: claims?.exp ?? 0,
  };
}
