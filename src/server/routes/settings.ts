import type { FastifyPluginAsync } from 'fastify';
import type { DB } from '../db/index.ts';
import { getSettings, updateSettings } from '../db/settings.ts';
import { settingsSchema } from '../../shared/settings.ts';

export const settingsRoutes =
  (db: DB): FastifyPluginAsync =>
  async (app) => {
    app.get('/settings', async () => getSettings(db));
    app.put('/settings', async (req) => updateSettings(db, settingsSchema.partial().parse(req.body)));
  };
