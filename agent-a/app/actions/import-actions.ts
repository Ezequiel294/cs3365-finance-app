'use server';
import type { ImportStart } from '@/shared/api-types';
import { NewImport, zodFields } from '@/shared/schemas';
import type { ImportJob } from '@/shared/types';
import { failure, type ActionResult } from '../lib/result';
import { call, enc } from './call';

export async function startImport(accountId: string, fileName: string, sha256: string, size: number): Promise<ActionResult<ImportStart>> {
  const parsed = NewImport.safeParse({ accountId, fileName, sha256, size });
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the file.', zodFields(parsed.error));
  return call<ImportStart>('post', '/api/imports', parsed.data);
}

export async function getImport(id: string): Promise<ActionResult<ImportJob>> {
  return call<ImportJob>('get', `/api/imports/${enc(id)}`);
}
