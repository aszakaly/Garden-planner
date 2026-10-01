import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DB } from '../db/index.ts';
import * as tasks from '../repos/tasks.ts';
import { customTaskInput, isoDate, taskStatePatch } from '../../shared/schemas.ts';
import { diffDays } from '../../shared/domain/isoDate.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const rangeQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((q) => q.from <= q.to, { message: 'A kezdőnap nem lehet későbbi a záró napnál', path: ['to'] })
  .refine((q) => diffDays(q.from, q.to) <= 400, { message: 'Legfeljebb 400 napos időszak kérhető le', path: ['to'] });

/** Feladatok: a tervből generáltak és a saját feladatok. */
export const taskRoutes =
  (db: DB): FastifyPluginAsync =>
  async (app) => {
    const id = (req: { params: unknown }) => idParam.parse(req.params).id;

    app.get('/tasks', async (req) => {
      const q = rangeQuery.parse(req.query);
      return tasks.listTasks(db, q.from, q.to);
    });
    app.patch('/tasks/:key', async (req, reply) => {
      const { key } = z.object({ key: z.string().min(1).max(100) }).parse(req.params);
      tasks.setTaskState(db, key, taskStatePatch.parse(req.body));
      return reply.status(204).send();
    });

    app.post('/custom-tasks', async (req, reply) =>
      reply.status(201).send(tasks.createCustomTask(db, customTaskInput.parse(req.body))),
    );
    app.put('/custom-tasks/:id', async (req) => tasks.updateCustomTask(db, id(req), customTaskInput.parse(req.body)));
    app.delete('/custom-tasks/:id', async (req, reply) => {
      tasks.deleteCustomTask(db, id(req));
      return reply.status(204).send();
    });
  };
