import 'server-only';
import { redirect } from 'next/navigation';
import { api } from '../lib/api-client';
import type { ActionResult } from '../lib/result';
import { SessionService } from '../lib/session';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * Every Server Action reads the session first, then calls the API with the user's token.
 * A token the API refuses sends the user to sign in again.
 */
export async function call<T>(method: Method, path: string, body?: unknown): Promise<ActionResult<T>> {
  const session = await SessionService.getSession();
  if (!session) redirect('/sign-in');
  let result: ActionResult<T>;
  switch (method) {
    case 'get':
      result = await api.get<T>(path, session.idToken);
      break;
    case 'delete':
      result = await api.delete<T>(path, session.idToken);
      break;
    default:
      result = await api[method]<T>(path, body ?? {}, session.idToken);
  }
  if (!result.ok && result.status === 401) redirect('/sign-in?expired=1');
  return result;
}

export const enc = encodeURIComponent;
