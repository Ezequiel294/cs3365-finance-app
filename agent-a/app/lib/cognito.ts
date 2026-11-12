import 'server-only';

/**
 * Cognito user pool calls made by the Next.js server. These are the public, unauthenticated
 * Cognito operations, called over Cognito's JSON protocol.
 */
const region = () => process.env.COGNITO_REGION ?? process.env.AWS_REGION ?? 'us-east-2';
const clientId = () => {
  const id = process.env.COGNITO_CLIENT_ID;
  if (!id) throw new Error('COGNITO_CLIENT_ID is not set');
  return id;
};

export class CognitoError extends Error {
  constructor(
    readonly type: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://cognito-idp.${region()}.amazonaws.com/`, {
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
    const type = String(json.__type ?? 'Error').split('#').pop()!;
    throw new CognitoError(type, String(json.message ?? 'Sign-in failed'));
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

export async function signInWithPassword(email: string, password: string): Promise<Tokens> {
  const out = await call<AuthResult>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId(),
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  if (!out.AuthenticationResult) throw new CognitoError(out.ChallengeName ?? 'Challenge', 'This account needs another step to sign in.');
  const r = out.AuthenticationResult;
  return { idToken: r.IdToken, refreshToken: r.RefreshToken, expiresIn: r.ExpiresIn };
}

export async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const out = await call<AuthResult>('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: clientId(),
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
  const r = out.AuthenticationResult!;
  return { idToken: r.IdToken, refreshToken: r.RefreshToken ?? refreshToken, expiresIn: r.ExpiresIn };
}

export async function signUp(email: string, password: string): Promise<void> {
  await call('SignUp', {
    ClientId: clientId(),
    Username: email,
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email }],
  });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await call('ConfirmSignUp', { ClientId: clientId(), Username: email, ConfirmationCode: code });
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await call('RevokeToken', { ClientId: clientId(), Token: refreshToken }).catch(() => undefined);
}

/** Reads the `sub` and expiry from an ID token. The API Gateway authorizer is what verifies it. */
export function decodeIdToken(idToken: string): { sub: string; email?: string; exp: number } | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf8'));
    return { sub: payload.sub, email: payload.email, exp: payload.exp };
  } catch {
    return null;
  }
}
