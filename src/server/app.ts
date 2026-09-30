import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import type { DB } from './db/index.ts';
import { settingsRoutes } from './routes/settings.ts';
import { masterRoutes } from './routes/master.ts';
import { inventoryRoutes } from './routes/inventory.ts';

export interface AppOptions {
  db: DB;
  /** A lefordított kliens mappája; ha létezik, a szerver ezt is kiszolgálja. */
  clientDir?: string;
  logger?: boolean;
}

export function buildApp({ db, clientDir, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'Érvénytelen adat',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ error: (err as Error).message });
  });

  app.register(
    async (api) => {
      api.get('/health', async () => ({ ok: true }));
      await api.register(settingsRoutes(db));
      await api.register(masterRoutes(db));
      await api.register(inventoryRoutes(db));
    },
    { prefix: '/api' },
  );

  if (clientDir && existsSync(clientDir)) {
    app.register(fastifyStatic, { root: clientDir, wildcard: false });
    // SPA: minden nem-API útvonal az index.html-t kapja
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Nem található' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
