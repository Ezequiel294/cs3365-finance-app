import "server-only";
import { serverConfig } from "./config";

/**
 * Calls the Cognito user pool's public (unauthenticated) API directly with fetch: sign-up,
 * confirmation, sign-in, refresh, and token revocation. No AWS credentials are involved.
 */
export class CognitoError extends Error {
  constructor(
    readonly type: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Tokens {
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}

async function call<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const { region } = serverConfig();
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const type = String(json.__type ?? "Error").split("#").pop() ?? "Error";
    throw new CognitoError(type, String(json.message ?? "The sign-in service rejected the request"));
  }
  return json as T;
}

export async function signUp(email: string, password: string): Promise<void> {
  const { clientId } = serverConfig();
  await call("SignUp", { ClientId: clientId, Username: email, Password: password, UserAttributes: [{ Name: "email", Value: email }] });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const { clientId } = serverConfig();
  await call("ConfirmSignUp", { ClientId: clientId, Username: email, ConfirmationCode: code });
}

export async function resendCode(email: string): Promise<void> {
  const { clientId } = serverConfig();
  await call("ResendConfirmationCode", { ClientId: clientId, Username: email });
}

interface AuthResult {
  AuthenticationResult?: { IdToken: string; RefreshToken?: string; ExpiresIn: number };
  ChallengeName?: string;
}

export async function signIn(email: string, password: string): Promise<Tokens> {
  const { clientId } = serverConfig();
  const out = await call<AuthResult>("InitiateAuth", {
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  if (!out.AuthenticationResult) throw new CognitoError(out.ChallengeName ?? "Challenge", "This account needs an extra sign-in step that the app does not support yet");
  const r = out.AuthenticationResult;
  return { idToken: r.IdToken, refreshToken: r.RefreshToken, expiresIn: r.ExpiresIn };
}

export async function refreshTokens(refreshToken: string): Promise<Tokens> {
  const { clientId } = serverConfig();
  const out = await call<AuthResult>("InitiateAuth", {
    ClientId: clientId,
    AuthFlow: "REFRESH_TOKEN_AUTH",
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
  if (!out.AuthenticationResult) throw new CognitoError("RefreshFailed", "Session expired");
  const r = out.AuthenticationResult;
  return { idToken: r.IdToken, refreshToken: r.RefreshToken, expiresIn: r.ExpiresIn };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const { clientId } = serverConfig();
  await call("RevokeToken", { ClientId: clientId, Token: refreshToken }).catch(() => undefined);
}

/** Friendly text for the Cognito errors a person can act on. */
export function describeCognitoError(error: unknown): string {
  if (!(error instanceof CognitoError)) return "Something went wrong; please try again";
  switch (error.type) {
    case "UsernameExistsException":
      return "An account with this email already exists. Sign in instead.";
    case "InvalidPasswordException":
      return error.message.replace(/^Password did not conform with policy: /, "Password: ");
    case "CodeMismatchException":
      return "That code is not right. Check the email and try again.";
    case "ExpiredCodeException":
      return "That code has expired. Send a new one.";
    case "NotAuthorizedException":
      return "Incorrect email or password.";
    case "UserNotConfirmedException":
      return "Confirm your email first. We sent you a code.";
    case "UserNotFoundException":
      return "Incorrect email or password.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return error.message;
  }
}
