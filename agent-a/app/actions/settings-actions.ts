'use server';
import { SettingsChanges, zodFields } from '@/shared/schemas';
import type { UserSettings } from '@/shared/types';
import { failure, type ActionResult } from '../lib/result';
import { call } from './call';

export async function getSettings(): Promise<ActionResult<UserSettings>> {
  return call<UserSettings>('get', '/api/settings');
}

export async function updateSettings(changes: unknown): Promise<ActionResult<UserSettings>> {
  const parsed = SettingsChanges.safeParse(changes);
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the highlighted fields.', zodFields(parsed.error));
  return call<UserSettings>('put', '/api/settings', parsed.data);
}
