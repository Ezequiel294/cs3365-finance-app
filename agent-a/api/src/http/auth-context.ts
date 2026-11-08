import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { UnauthorizedError } from "./errors";

/**
 * Who is calling. `userId` is the Cognito `sub` claim verified by API Gateway's JWT authorizer,
 * never a value sent by the browser.
 */
export class AuthContext {
  private constructor(readonly userId: string) {}

  static fromCognitoClaims(event: unknown): AuthContext {
    const claims = (event as APIGatewayProxyEventV2WithJWTAuthorizer)?.requestContext?.authorizer?.jwt?.claims;
    const sub = claims?.sub;
    if (typeof sub !== "string" || !/^[A-Za-z0-9-]{10,64}$/.test(sub)) throw new UnauthorizedError();
    return new AuthContext(sub);
  }
}
