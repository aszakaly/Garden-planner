import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DB } from '../db/index.ts';
import * as repo from '../repos/master.ts';
import {
  companionInput,
  cropGroupInput,
  familyInput,
  plantInput,
  varietyInput,
  windowInput,
} from '../../shared/schemas.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export const masterRoutes =
  (db: DB): FastifyPluginAsync =>
  async (app) => {
    const id = (req: { params: unknown }) => idParam.parse(req.params).id;

    // Családok
    app.get('/families', async () => repo.listFamilies(db));
    app.post('/families', async (req, reply) => reply.status(201).send(repo.createFamily(db, familyInput.parse(req.body))));
    app.put('/families/:id', async (req) => repo.updateFamily(db, id(req), familyInput.parse(req.body)));
    app.delete('/families/:id', async (req, reply) => {
      repo.deleteFamily(db, id(req));
      return reply.status(204).send();
    });

    // Zöldségcsoportok
    app.get('/crop-groups', async () => repo.listCropGroups(db));
    app.post('/crop-groups', async (req, reply) =>
      reply.status(201).send(repo.createCropGroup(db, cropGroupInput.parse(req.body))),
    );
    app.put('/crop-groups/:id', async (req) => repo.updateCropGroup(db, id(req), cropGroupInput.parse(req.body)));
    app.delete('/crop-groups/:id', async (req, reply) => {
      repo.deleteCropGroup(db, id(req));
      return reply.status(204).send();
    });

    // Növények
    app.get('/plants', async () => repo.listPlants(db));
    app.get('/plants/:id', async (req) => repo.getPlantDetail(db, id(req)));
    app.post('/plants', async (req, reply) => reply.status(201).send(repo.createPlant(db, plantInput.parse(req.body))));
    app.put('/plants/:id', async (req) => repo.updatePlant(db, id(req), plantInput.parse(req.body)));
    app.patch('/plants/:id', async (req) => repo.updatePlant(db, id(req), plantInput.partial().parse(req.body)));
    app.delete('/plants/:id', async (req, reply) => {
      repo.deletePlant(db, id(req));
      return reply.status(204).send();
    });

    // Időszakok (növényhez vagy fajtához)
    app.post('/plants/:id/windows', async (req, reply) =>
      reply.status(201).send(repo.createWindow(db, { plant_id: id(req) }, windowInput.parse(req.body))),
    );
    app.post('/varieties/:id/windows', async (req, reply) =>
      reply.status(201).send(repo.createWindow(db, { variety_id: id(req) }, windowInput.parse(req.body))),
    );
    app.put('/windows/:id', async (req) => repo.updateWindow(db, id(req), windowInput.parse(req.body)));
    app.delete('/windows/:id', async (req, reply) => {
      repo.deleteWindow(db, id(req));
      return reply.status(204).send();
    });

    // Fajták
    app.get('/varieties', async () => repo.listVarieties(db));
    app.post('/plants/:id/varieties', async (req, reply) =>
      reply.status(201).send(repo.createVariety(db, id(req), varietyInput.parse(req.body))),
    );
    app.put('/varieties/:id', async (req) => repo.updateVariety(db, id(req), varietyInput.parse(req.body)));
    app.delete('/varieties/:id', async (req, reply) => {
      repo.deleteVariety(db, id(req));
      return reply.status(204).send();
    });

    // Társítások
    app.get('/companions', async () => repo.allCompanions(db));
    app.put('/companions', async (req, reply) => {
      repo.upsertCompanion(db, companionInput.parse(req.body));
      return reply.status(204).send();
    });
    app.delete('/companions/:id', async (req, reply) => {
      repo.deleteCompanion(db, id(req));
      return reply.status(204).send();
    });
  };
