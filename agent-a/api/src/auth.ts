import { UnauthorizedError } from './errors';

interface JwtEvent {
  requestContext?: { authorizer?: { jwt?: { claims?: Record<string, unknown> } } };
}

/** Who is calling. `userId` is the Cognito `sub` claim, never a value sent by the browser. */
export class AuthContext {
  private constructor(readonly userId: string) {}

  static fromCognitoClaims(event: unknown): AuthContext {
    const sub = (event as JwtEvent)?.requestContext?.authorizer?.jwt?.claims?.sub;
    if (typeof sub !== 'string' || sub.length === 0) throw new UnauthorizedError();
    return new AuthContext(sub);
  }
}
