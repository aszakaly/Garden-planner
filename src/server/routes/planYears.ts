import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DB } from '../db/index.ts';
import * as planYears from '../repos/planYears.ts';
import { carryOverInput, planYearInput } from '../../shared/schemas.ts';

const yearParam = z.object({ year: z.coerce.number().int().min(1900).max(2200) });

/** Tervév: állapot, jegyzet, évelők átvitele. */
export const planYearRoutes =
  (db: DB): FastifyPluginAsync =>
  async (app) => {
    const year = (req: { params: unknown }) => yearParam.parse(req.params).year;

    app.get('/plan-years/:year', async (req) => planYears.getPlanYear(db, year(req)));
    app.put('/plan-years/:year', async (req) => planYears.savePlanYear(db, year(req), planYearInput.parse(req.body)));
    app.get('/plan-years/:year/carryover', async (req) => planYears.carryCandidates(db, year(req)));
    app.post('/plan-years/:year/carryover', async (req, reply) =>
      reply.status(201).send(planYears.carryOver(db, year(req), carryOverInput.parse(req.body).ids)),
    );
  };
