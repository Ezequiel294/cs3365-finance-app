import { Router } from '@aws-lambda-powertools/event-handler/http';
import { NameInput, SettingsInput } from '@finance/shared';
import type { ServiceFactory } from '../service-factory';
import { bodyOf, json, userIdOf } from './http';

/**
 * Categories, tags, and settings. Not in the class diagram's route table; added so
 * the UI can pick categories and tags (02-S02, 03-S02) and the week start (03-S10).
 */
export function taxonomyRouter(f: ServiceFactory): Router {
  const app = new Router();

  app.get('/api/categories', async (ctx) => json(200, await f.taxonomyService().listCategories(userIdOf(ctx))));
  app.post('/api/categories', async (ctx) => {
    const { name } = await bodyOf(ctx, NameInput);
    return json(201, await f.taxonomyService().createCategory(userIdOf(ctx), name));
  });
  app.get('/api/tags', async (ctx) => json(200, await f.taxonomyService().listTags(userIdOf(ctx))));
  app.post('/api/tags', async (ctx) => {
    const { name } = await bodyOf(ctx, NameInput);
    return json(201, await f.taxonomyService().createTag(userIdOf(ctx), name));
  });
  app.get('/api/settings', async (ctx) => json(200, await f.taxonomyService().getSettings(userIdOf(ctx))));
  app.put('/api/settings', async (ctx) => {
    const changes = await bodyOf(ctx, SettingsInput);
    return json(200, await f.taxonomyService().updateSettings(userIdOf(ctx), changes));
  });

  return app;
}
