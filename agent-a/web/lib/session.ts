import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decodeClaims, refreshTokens, type Tokens } from './cognito';
import { config } from './config';

const ID = 'fa_id';
const REFRESH = 'fa_refresh';
const EXP = 'fa_exp';
const REFRESH_MAX_AGE = 30 * 86400;

export interface Session {
  userId: string;
  email: string;
  idToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Keeps the Cognito tokens in HttpOnly, SameSite=Strict cookies and hands the ID
 * token to `ApiClient`, so browser JavaScript never sees it.
 */
export const SessionService = {
  async getSession(store?: CookieStore): Promise<Session | null> {
    const jar = store ?? (await cookies());
    const idToken = jar.get(ID)?.value;
    const refreshToken = jar.get(REFRESH)?.value ?? null;
    if (!idToken && !refreshToken) return null;
    const claims = idToken ? decodeClaims(idToken) : {};
    return {
      userId: String(claims.sub ?? ''),
      email: String(claims.email ?? ''),
      idToken: idToken ?? '',
      refreshToken,
      expiresAt: Number(jar.get(EXP)?.value ?? 0),
    };
  },

  /**
   * The ID token for an API call. In a page render (where cookies cannot be set) an
   * expired token redirects through `/auth/refresh`; in a Server Action it is refreshed here.
   */
  async requireIdToken(options: { returnTo?: string; canSetCookies?: boolean } = {}): Promise<string> {
    const jar = await cookies();
    const session = await SessionService.getSession(jar);
    const back = encodeURIComponent(options.returnTo ?? '/dashboard');
    if (!session) redirect(`/login?next=${back}`);
    const fresh = session.idToken && session.expiresAt - 60 > Date.now() / 1000;
    if (fresh) return session.idToken;
    if (!session.refreshToken) redirect(`/login?next=${back}`);
    if (!options.canSetCookies) redirect(`/auth/refresh?next=${back}`);
    const refreshed = await SessionService.refresh(session);
    if (!refreshed) redirect(`/login?next=${back}`);
    return refreshed.idToken;
  },

  async refresh(session: Session): Promise<Session | null> {
    if (!session.refreshToken) return null;
    try {
      const tokens = await refreshTokens(session.refreshToken);
      await SessionService.store(tokens);
      const claims = decodeClaims(tokens.idToken);
      return {
        userId: String(claims.sub ?? ''),
        email: String(claims.email ?? ''),
        idToken: tokens.idToken,
        refreshToken: tokens.refreshToken ?? session.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
      };
    } catch {
      await SessionService.signOut();
      return null;
    }
  },

  async store(tokens: Tokens): Promise<void> {
    const jar = await cookies();
    const base = { httpOnly: true, sameSite: 'strict' as const, secure: config.secureCookies, path: '/' };
    jar.set(ID, tokens.idToken, { ...base, maxAge: tokens.expiresIn });
    jar.set(EXP, String(Math.floor(Date.now() / 1000) + tokens.expiresIn), { ...base, maxAge: REFRESH_MAX_AGE });
    if (tokens.refreshToken) jar.set(REFRESH, tokens.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
  },

  async signOut(): Promise<void> {
    const jar = await cookies();
    for (const name of [ID, REFRESH, EXP]) jar.delete(name);
  },
};
