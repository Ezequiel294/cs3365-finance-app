'use server';
import type { Catalog } from '@/shared/api-types';
import { NewCatalogEntry, zodFields } from '@/shared/schemas';
import type { Category, Tag } from '@/shared/types';
import { failure, type ActionResult } from '../lib/result';
import { call } from './call';

export async function listCatalog(): Promise<ActionResult<Catalog>> {
  return call<Catalog>('get', '/api/catalog');
}

export async function createCategory(name: string): Promise<ActionResult<Category>> {
  const parsed = NewCatalogEntry.safeParse({ name });
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the name.', zodFields(parsed.error));
  return call<Category>('post', '/api/categories', parsed.data);
}

export async function createTag(name: string): Promise<ActionResult<Tag>> {
  const parsed = NewCatalogEntry.safeParse({ name });
  if (!parsed.success) return failure('VALIDATION_ERROR', 'Check the name.', zodFields(parsed.error));
  return call<Tag>('post', '/api/tags', parsed.data);
}
