/** A Server Action never throws to the page: it returns one of these. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fields?: Record<string, string>; details?: Record<string, unknown>; status?: number };

export function failure(
  code: string,
  message: string,
  fields?: Record<string, string>,
): { ok: false; code: string; message: string; fields?: Record<string, string> } {
  return { ok: false, code, message, ...(fields ? { fields } : {}) };
}
