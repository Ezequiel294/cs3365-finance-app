import 'server-only';
import { config } from './config';

/** Minimal client for the public Cognito user pool APIs (no AWS credentials needed). */
export class CognitoError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const code = String(json.__type ?? 'Error').split('#').pop()!;
    throw new CognitoError(code, String(json.message ?? json.Message ?? 'Request failed'));
  }
  return json as T;
}

export interface Tokens {
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}

interface AuthResult {
  AuthenticationResult?: { IdToken: string; RefreshToken?: string; ExpiresIn: number };
  ChallengeName?: string;
}

export async function signIn(email: string, password: string): Promise<Tokens> {
  const out = await call<AuthResult>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: config.clientId,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  if (!out.AuthenticationResult) throw new CognitoError('Challenge', `Unsupported sign-in step: ${out.ChallengeName}`);
  const r = out.AuthenticationResult;
  return { idToken: r.IdToken, refreshToken: r.RefreshToken, expiresIn: r.ExpiresIn };
}

export async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const out = await call<AuthResult>('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: config.clientId,
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
  const r = out.AuthenticationResult!;
  return { idToken: r.IdToken, refreshToken: r.RefreshToken ?? refreshToken, expiresIn: r.ExpiresIn };
}

export async function signUp(email: string, password: string): Promise<{ confirmed: boolean }> {
  const out = await call<{ UserConfirmed: boolean }>('SignUp', {
    ClientId: config.clientId,
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  });
  return { confirmed: out.UserConfirmed };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await call('ConfirmSignUp', { ClientId: config.clientId, Username: email, ConfirmationCode: code });
}

export async function resendCode(email: string): Promise<void> {
  await call('ResendConfirmationCode', { ClientId: config.clientId, Username: email });
}

/** Reads the claims of a JWT without verifying it (API Gateway verifies every request). */
export function decodeClaims(jwt: string): Record<string, unknown> {
  const payload = jwt.split('.')[1] ?? '';
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}
