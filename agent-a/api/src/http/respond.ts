import type { z } from 'zod';
import { zodFields } from '../../../shared/schemas';
import { ValidationError } from './errors';

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body ?? null), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const ok = (body: unknown) => json(200, body);
export const created = (body: unknown) => json(201, body);

interface ReqLike {
  req: Request;
}

/** Parse and validate the JSON body with a shared Zod schema. */
export async function readBody<S extends z.ZodType>(ctx: ReqLike, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    const text = await ctx.req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ValidationError('The request body is not valid JSON.');
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError('Check the highlighted fields.', zodFields(result.error));
  return result.data;
}

/** Validate a query or path value with a Zod schema. */
export function readParam<S extends z.ZodType>(value: unknown, schema: S, name: string): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(`Invalid ${name}.`, { [name]: result.error.issues[0]?.message ?? 'Invalid' });
  return result.data;
}

export function query(ctx: ReqLike): URLSearchParams {
  return new URL(ctx.req.url).searchParams;
}

export function param(ctx: { params: Record<string, string> }, name: string): string {
  const raw = ctx.params[name] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
