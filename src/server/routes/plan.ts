import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DB } from '../db/index.ts';
import * as plantings from '../repos/plantings.ts';
import { plantingActualInput, plantingCreateInput, plantingInput } from '../../shared/schemas.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({
  year: z.coerce.number().int().min(1900).max(2200).default(new Date().getFullYear()),
  from_year: z.coerce.number().int().min(1900).max(2200).optional(),
  bed_id: z.coerce.number().int().positive().optional(),
});

/** Éves terv: ültetések. */
export const planRoutes =
  (db: DB): FastifyPluginAsync =>
  async (app) => {
    const id = (req: { params: unknown }) => idParam.parse(req.params).id;

    app.get('/plantings', async (req) => {
      const q = listQuery.parse(req.query);
      return plantings.listPlantings(db, { year: q.year, fromYear: q.from_year, bedId: q.bed_id });
    });
    app.get('/plantings/history', async (req) => {
      const q = z
        .object({ plant_id: z.coerce.number().int().positive().optional(), variety_id: z.coerce.number().int().positive().optional() })
        .refine((x) => x.plant_id || x.variety_id, { message: 'Növény vagy fajta megadása kötelező' })
        .parse(req.query);
      return plantings.plantingHistory(db, { plantId: q.plant_id, varietyId: q.variety_id });
    });
    app.get('/plantings/:id', async (req) => plantings.getPlanting(db, id(req)));
    app.patch('/plantings/:id/actual', async (req) =>
      plantings.updatePlantingActual(db, id(req), plantingActualInput.parse(req.body)),
    );
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
