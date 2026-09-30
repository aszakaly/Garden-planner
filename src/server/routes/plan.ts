import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DB } from '../db/index.ts';
import * as plantings from '../repos/plantings.ts';
import { plantingCreateInput, plantingInput } from '../../shared/schemas.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({
  year: z.coerce.number().int().min(1900).max(2200).default(new Date().getFullYear()),
  bed_id: z.coerce.number().int().positive().optional(),
});

/** Éves terv: ültetések. */
export const planRoutes =
  (db: DB): FastifyPluginAsync =>
  async (app) => {
    const id = (req: { params: unknown }) => idParam.parse(req.params).id;

    app.get('/plantings', async (req) => {
      const q = listQuery.parse(req.query);
      return plantings.listPlantings(db, { year: q.year, bedId: q.bed_id });
    });
    app.get('/plantings/:id', async (req) => plantings.getPlanting(db, id(req)));
    app.post('/plantings', async (req, reply) =>
      reply.status(201).send(plantings.createPlantings(db, plantingCreateInput.parse(req.body))),
    );
    app.put('/plantings/:id', async (req) => plantings.updatePlanting(db, id(req), plantingInput.parse(req.body)));
    app.delete('/plantings/:id', async (req, reply) => {
      const series = z.object({ series: z.enum(['0', '1']).optional() }).parse(req.query).series === '1';
      plantings.deletePlanting(db, id(req), series);
      return reply.status(204).send();
    });
  };
