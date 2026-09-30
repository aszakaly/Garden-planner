import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DB } from '../db/index.ts';
import * as seeds from '../repos/seeds.ts';
import * as garden from '../repos/garden.ts';
import { bedInput, gardenInput, seedStockInput } from '../../shared/schemas.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const bedQuery = z.object({
  year: z.coerce.number().int().min(1950).max(2200).default(new Date().getFullYear()),
  active: z.enum(['0', '1']).optional(),
});

/** Vetőmagkészlet, kert és ágyások. */
export const inventoryRoutes =
  (db: DB): FastifyPluginAsync =>
  async (app) => {
    const id = (req: { params: unknown }) => idParam.parse(req.params).id;

    // Vetőmagkészlet
    app.get('/seeds', async () => seeds.listSeeds(db));
    app.post('/seeds', async (req, reply) => reply.status(201).send(seeds.createSeed(db, seedStockInput.parse(req.body))));
    app.put('/seeds/:id', async (req) => seeds.updateSeed(db, id(req), seedStockInput.parse(req.body)));
    app.patch('/seeds/:id', async (req) =>
      seeds.setSeedInStock(db, id(req), z.object({ in_stock: z.boolean() }).parse(req.body).in_stock),
    );
    app.delete('/seeds/:id', async (req, reply) => {
      seeds.deleteSeed(db, id(req));
      return reply.status(204).send();
    });

    // Kert
    app.get('/gardens', async () => garden.listGardens(db));
    app.put('/gardens/:id', async (req) => garden.updateGarden(db, id(req), gardenInput.parse(req.body)));

    // Ágyások
    app.get('/beds', async (req) => {
      const q = bedQuery.parse(req.query);
      return garden.listBeds(db, q.year, q.active === '1');
    });
    app.get('/beds/:id', async (req) => garden.getBed(db, id(req)));
    app.post('/beds', async (req, reply) => reply.status(201).send(garden.createBed(db, bedInput.parse(req.body))));
    app.put('/beds/:id', async (req) => garden.updateBed(db, id(req), bedInput.parse(req.body)));
    app.delete('/beds/:id', async (req, reply) => {
      garden.deleteBed(db, id(req));
      return reply.status(204).send();
    });
  };
