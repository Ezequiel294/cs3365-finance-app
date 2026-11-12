'use server';
import type { ConnectionView, GmailSetup } from '@/shared/api-types';
import type { ActionResult } from '../lib/result';
import { call, enc } from './call';

export async function connectGmail(): Promise<ActionResult<GmailSetup>> {
  return call<GmailSetup>('post', '/api/connections/gmail', {});
}

export async function listConnections(): Promise<ActionResult<ConnectionView[]>> {
  return call<ConnectionView[]>('get', '/api/connections');
}

export async function rotateGmail(id: string): Promise<ActionResult<GmailSetup>> {
  return call<GmailSetup>('post', `/api/connections/gmail/${enc(id)}/rotate`, {});
}

export async function revokeConnection(id: string): Promise<ActionResult<unknown>> {
  return call('delete', `/api/connections/${enc(id)}`);
}
