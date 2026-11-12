import { describe, expect, it } from 'vitest';
import type { Category, Rule, Tag } from '../../../shared/types';
import { CatalogService } from '../../src/categorization/catalog-service';
import { Categorizer } from '../../src/categorization/categorizer';
import { Normalizer } from '../../src/categorization/normalizer';
import { SettingsService } from '../../src/categorization/settings-service';
import { ConflictError } from '../../src/http/errors';
import { GLOBAL_PK } from '../../src/keys';
import { USER } from '../helpers';

describe('Normalizer', () => {
  const n = new Normalizer();
  it.each([
    ['AUTOMERCADO ESCAZU 042', 'automercado'],
    ['Spotify', 'spotify'],
    ['DTR:inversiones_hapi_VT', 'dtr-inversiones-hapi-vt'],
    ['SINPE MOVIL Gasolina_______', 'sinpe-movil-gasolina'],
    ['Pago Liberty Móvil (Movistar 8', 'pago-liberty-movil-movistar'],
    ['TRANSPORTES JACO CENTRAL CR', 'transportes-jaco-central'],
    ['1234', 'unknown'],
  ])('%s → %s', (raw, key) => expect(n.normalize(raw)).toBe(key));
});

describe('Categorizer (02-S03)', () => {
  const rules = new Map<string, Rule>([
    [`${USER}|spotify`, { merchantKey: 'spotify', categoryId: 'subscriptions', tagIds: [], kind: null, scope: 'user' }],
    [`${USER}|dtr-inversiones-hapi-vt`, { merchantKey: 'dtr-inversiones-hapi-vt', categoryId: null, tagIds: [], kind: 'transfer', scope: 'user' }],
    [`${GLOBAL_PK}|automercado`, { merchantKey: 'automercado', categoryId: 'groceries', tagIds: [], kind: null, scope: 'global' }],
  ]);
  const c = new Categorizer({ getRule: async (scope, key) => rules.get(`${scope}|${key}`) ?? null });

  it('the user rule first, then the global rule, otherwise review', async () => {
    expect(await c.categorize(USER, 'spotify')).toMatchObject({ categoryId: 'subscriptions', categorizedBy: 'rule', status: 'confirmed' });
    expect(await c.categorize(USER, 'automercado')).toMatchObject({ categoryId: 'groceries', categorizedBy: 'global' });
    expect(await c.categorize(USER, 'unknown-shop')).toMatchObject({ categoryId: null, status: 'pending_review', categorizedBy: 'none' });
  });
  it('a rule can carry a kind', async () => {
    expect((await c.categorize(USER, 'dtr-inversiones-hapi-vt')).kind).toBe('transfer');
  });
});

describe('CatalogService (02-S02a)', () => {
  const global: Category[] = [
    { id: 'other', name: 'Other', scope: 'global', archived: false },
    { id: 'groceries', name: 'Groceries', scope: 'global', archived: false },
  ];
  const own: Category[] = [{ id: 'c-1', name: 'Books', scope: 'user', archived: false }];
  const tags: Tag[] = [{ id: 't-1', name: 'University', scope: 'user', archived: false }];
  const svc = new CatalogService({
    listCategories: async () => [...global, ...own],
    listTags: async () => tags,
    putCategory: async () => undefined,
    putTag: async () => undefined,
  } as never);

  it('lists global categories, then own, sorted by name', async () => {
    const cat = await svc.list(USER);
    expect(cat.categories.map((c) => c.name)).toEqual(['Groceries', 'Other', 'Books']);
    expect(cat.tags).toEqual(tags);
  });
  it('a taken name is a 409, ignoring case and spaces', async () => {
    await expect(svc.createTag(USER, ' university ')).rejects.toBeInstanceOf(ConflictError);
    await expect(svc.createCategory(USER, 'GROCERIES')).rejects.toThrow('You already have a category called GROCERIES.');
    expect(await svc.createTag(USER, 'Trip to Panama')).toMatchObject({ name: 'Trip to Panama', scope: 'user' });
  });
});

describe('SettingsService (03-S10)', () => {
  it('defaults, and rebuilds weekly budgets only when the week start changes', async () => {
    let stored: any = null;
    let rebuilds = 0;
    const svc = new SettingsService(
      { getSettings: async () => stored, putSettings: async (_u, s) => void (stored = s) },
      () => ({ rebuildWeekly: async () => void rebuilds++ }),
    );
    expect(await svc.get(USER)).toMatchObject({ timeZone: 'America/Costa_Rica', weekStart: 'MONDAY', baseCurrency: 'USD' });
    await svc.update(USER, { weekStart: 'SUNDAY' });
    await svc.update(USER, { timeZone: 'America/Denver' });
    expect(stored).toMatchObject({ weekStart: 'SUNDAY', timeZone: 'America/Denver' });
    expect(rebuilds).toBe(1);
  });
});
