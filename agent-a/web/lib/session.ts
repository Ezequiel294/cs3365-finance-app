import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refreshTokens, revokeRefreshToken, type Tokens } from "./cognito";

/**
 * Keeps the Cognito tokens in HttpOnly, SameSite=Strict cookies and hands the ID token to
 * ApiClient, so browser JavaScript never sees a token.
 */
export interface Session {
  userId: string;
  email?: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const ID_COOKIE = "fa_id";
const REFRESH_COOKIE = "fa_rt";
const EXPIRES_COOKIE = "fa_exp";
const REFRESH_LIFETIME_SECONDS = 30 * 24 * 3600;
const EARLY_REFRESH_MS = 60_000;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

function decodeClaims(idToken: string): { sub?: string; email?: string; exp?: number } {
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export class SessionService {
  async getSession(store?: CookieStore): Promise<Session | null> {
    const jar = store ?? (await cookies());
    const idToken = jar.get(ID_COOKIE)?.value;
    const refreshToken = jar.get(REFRESH_COOKIE)?.value;
    if (!idToken && !refreshToken) return null;
    const claims = idToken ? decodeClaims(idToken) : {};
    const expiresAt = Number(jar.get(EXPIRES_COOKIE)?.value ?? (claims.exp ?? 0) * 1000);
    return { userId: claims.sub ?? "", email: claims.email, idToken: idToken ?? "", refreshToken, expiresAt };
  }

  /** The ID token to send to the API, refreshed when it is about to expire. Redirects to sign-in without a session. */
  async requireIdToken(): Promise<string> {
    const jar = await cookies();
    let session = await this.getSession(jar);
    if (!session) redirect("/signin");
    if (!session.idToken || session.expiresAt - EARLY_REFRESH_MS < Date.now()) {
      session = await this.refresh(session).catch(() => null);
      if (!session) redirect("/signin");
    }
    return session.idToken;
  }

  /** Exchanges the refresh token for a new ID token. Cookies are updated when the caller may set them (actions, route handlers). */
  async refresh(session: Session): Promise<Session> {
    if (!session.refreshToken) throw new Error("no refresh token");
    const tokens = await refreshTokens(session.refreshToken);
    const next = this.fromTokens(tokens, session.refreshToken);
    try {
      await this.store(tokens, session.refreshToken);
    } catch {
      // Rendering a Server Component: cookies are read-only here, the next action stores them.
    }
    return next;
  }

  async signIn(tokens: Tokens): Promise<void> {
    await this.store(tokens);
  }

  async signOut(): Promise<void> {
    const jar = await cookies();
    const refreshToken = jar.get(REFRESH_COOKIE)?.value;
    if (refreshToken) await revokeRefreshToken(refreshToken);
    for (const name of [ID_COOKIE, REFRESH_COOKIE, EXPIRES_COOKIE]) jar.delete(name);
  }

  private async store(tokens: Tokens, keepRefresh?: string): Promise<void> {
    const jar = await cookies();
    const expiresAt = Date.now() + tokens.expiresIn * 1000;
    jar.set(ID_COOKIE, tokens.idToken, cookieOptions(REFRESH_LIFETIME_SECONDS));
    jar.set(EXPIRES_COOKIE, String(expiresAt), cookieOptions(REFRESH_LIFETIME_SECONDS));
    const refresh = tokens.refreshToken ?? keepRefresh;
    if (refresh) jar.set(REFRESH_COOKIE, refresh, cookieOptions(REFRESH_LIFETIME_SECONDS));
  }

  private fromTokens(tokens: Tokens, keepRefresh?: string): Session {
    const claims = decodeClaims(tokens.idToken);
    return {
      userId: claims.sub ?? "",
      email: claims.email,
      idToken: tokens.idToken,
      refreshToken: tokens.refreshToken ?? keepRefresh,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
    };
  }
}

export const sessionService = new SessionService();
