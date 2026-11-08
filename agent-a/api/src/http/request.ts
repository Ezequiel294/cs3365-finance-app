import type { RequestContext } from "@aws-lambda-powertools/event-handler/types";
import type { z } from "zod";
import { AuthContext } from "./auth-context";
import { ValidationError } from "./errors";

/** Validates a value with a shared Zod schema. Error messages name fields, never echo values. */
export function validate<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    throw new ValidationError(field ? `${field}: ${issue.message}` : issue.message);
  }
  return result.data;
}

export async function body<S extends z.ZodType>(reqCtx: RequestContext, schema: S): Promise<z.infer<S>> {
  let parsed: unknown;
  try {
    const text = await reqCtx.req.text();
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new ValidationError("the request body must be JSON");
  }
  return validate(schema, parsed);
}

export function query(reqCtx: RequestContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URL(reqCtx.req.url).searchParams) out[k] = v;
  return out;
}

export function userId(reqCtx: RequestContext): string {
  return AuthContext.fromCognitoClaims(reqCtx.event).userId;
}

export function bearer(reqCtx: RequestContext): string | undefined {
  const header = reqCtx.req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  return m?.[1];
}

export function param(reqCtx: RequestContext, name: string): string {
  const value = reqCtx.params[name];
  if (!value || value.length > 128) throw new ValidationError(`${name} is required`);
  return decodeURIComponent(value);
}
