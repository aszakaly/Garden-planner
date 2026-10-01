import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { DB } from '../db/index.ts';
import * as journal from '../repos/journal.ts';
import { JOURNAL_TYPES } from '../../shared/labels.ts';
import { isoDate, journalInput } from '../../shared/schemas.ts';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const optId = z.coerce.number().int().positive().optional();
const listQuery = z.object({
  q: z.string().max(200).optional(),
  type: z.enum(JOURNAL_TYPES).optional(),
  planting_id: optId,
  plant_id: optId,
  variety_id: optId,
  bed_id: optId,
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** Napló: bejegyzések, szűrés, teljes szöveges keresés. */
export const journalRoutes =
  (db: DB): FastifyPluginAsync =>
  async (app) => {
    const id = (req: { params: unknown }) => idParam.parse(req.params).id;

    app.get('/journal', async (req) => {
      const q = listQuery.parse(req.query);
      return journal.listJournal(db, {
        q: q.q,
        type: q.type,
        plantingId: q.planting_id,
        plantId: q.plant_id,
        varietyId: q.variety_id,
        bedId: q.bed_id,
        year: q.year,
        from: q.from,
        to: q.to,
      });
    });
    app.get('/journal/count', async (req) => {
      const { year } = z.object({ year: z.coerce.number().int().min(1900).max(2200).optional() }).parse(req.query);
      return { count: journal.countJournal(db, year) };
    });
    app.get('/journal/:id', async (req) => journal.getJournalEntry(db, id(req)));
    app.post('/journal', async (req, reply) => reply.status(201).send(journal.createJournalEntry(db, journalInput.parse(req.body))));
    app.put('/journal/:id', async (req) => journal.updateJournalEntry(db, id(req), journalInput.parse(req.body)));
    app.delete('/journal/:id', async (req, reply) => {
      journal.deleteJournalEntry(db, id(req));
      return reply.status(204).send();
    });
  };
