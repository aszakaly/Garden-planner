import type { DB } from '../db/index.ts';
import { transaction } from '../db/index.ts';
import { HttpError, insert, notFound, remove, update } from '../db/helpers.ts';
import {
  ACTUAL_COLUMN,
  compareTasks,
  customTaskItem,
  generateTasks,
  parseTaskKey,
  SLOT_FIELD,
  statusFromActuals,
  type CustomTaskRow,
  type TaskItem,
  type TaskState,
} from '../../shared/domain/tasks.ts';
import type { PlantingStatus } from '../../shared/labels.ts';
import type { CustomTaskInput, TaskStatePatch } from '../../shared/schemas.ts';
import type { Bed } from '../../shared/types.ts';
import { listPlantings } from './plantings.ts';

const bad = (message: string) => new HttpError(400, message);

const CUSTOM_SELECT = `
  SELECT c.*, b.name AS bed_name, b.color AS bed_color
  FROM custom_task c
  LEFT JOIN bed b ON b.id = c.bed_id`;

/**
 * A két nap közé eső feladatok: a tervből generáltak és a saját feladatok.
 * Az előző és a következő év ültetéseit is figyelembe veszi (évhatáron átnyúló
 * kultúrák, a januári vetéshez decemberi beszerzés).
 */
export function listTasks(db: DB, from: string, to: string): TaskItem[] {
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const plantings = listPlantings(db, { year: toYear + 1, fromYear: fromYear - 1 });
  const states = new Map(
    (db.prepare('SELECT task_key, done_at, moved_to, note FROM task_state').all() as unknown as TaskState[]).map((s) => [s.task_key, s]),
  );
  const beds = new Map((db.prepare('SELECT * FROM bed').all() as unknown as Bed[]).map((b) => [b.id, b]));
  const generated = generateTasks({ plantings, states, beds }).filter((t) => t.date >= from && t.date <= to);
  const custom = (db.prepare(`${CUSTOM_SELECT} WHERE c.due_date BETWEEN ? AND ?`).all(from, to) as unknown as CustomTaskRow[]).map(
    customTaskItem,
  );
  return [...generated, ...custom].sort(compareTasks);
}

/**
 * Feladat állapotának módosítása. A dátumhoz kötött lépéseknél (vetés, kiültetés,
 * betakarítás, felszabadulás) az elvégzés az ültetés tény dátumát írja, és a státuszt is frissíti.
 */
export function setTaskState(db: DB, key: string, patch: TaskStatePatch): void {
  const parsed = parseTaskKey(key);
  if (!parsed) throw bad('Ismeretlen feladat.');

  transaction(db, () => {
    if (parsed.slot === 'sajat') {
      const ok = update(db, 'custom_task', parsed.customId, {
        done_at: patch.done_on,
        due_date: patch.moved_to ?? undefined,
        notes: patch.note,
      });
      if (!ok) throw notFound('A feladat');
      return;
    }

    const { done_on, ...rest } = patch;
    const state: Record<string, string | null | undefined> = { ...rest };
    const field = parsed.slot === 'beszerzes' ? undefined : SLOT_FIELD[parsed.slot];
    if (parsed.slot !== 'beszerzes') {
      const planting = db.prepare('SELECT * FROM planting WHERE id = ?').get(parsed.plantingId) as Record<string, unknown> | undefined;
      if (!planting) throw notFound('Az ültetés');
      if (field && done_on !== undefined) {
        const actual = {
          sow: planting.actual_sow_date as string | null,
          transplant: planting.actual_transplant_date as string | null,
          harvestStart: planting.actual_harvest_start as string | null,
          end: planting.actual_end_date as string | null,
          [field]: done_on,
        };
        update(db, 'planting', parsed.plantingId, {
          [ACTUAL_COLUMN[field]]: done_on,
          status: statusFromActuals(planting.status as PlantingStatus, actual),
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (!field) state.done_at = done_on;

    const fields = Object.entries(state).filter(([, v]) => v !== undefined) as [string, string | null][];
    if (!fields.length) return;
    db.prepare(
      `INSERT INTO task_state (task_key, ${fields.map(([k]) => k).join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})
       ON CONFLICT(task_key) DO UPDATE SET ${fields.map(([k]) => `${k} = excluded.${k}`).join(', ')}`,
    ).run(key, ...fields.map(([, v]) => v));
    // Az üres állapotsor felesleges
    db.prepare('DELETE FROM task_state WHERE task_key = ? AND done_at IS NULL AND moved_to IS NULL AND note IS NULL').run(key);
  });
}

// --- Saját feladatok -----------------------------------------------------------

export function getCustomTask(db: DB, id: number): TaskItem {
  const row = db.prepare(`${CUSTOM_SELECT} WHERE c.id = ?`).get(id);
  if (!row) throw notFound('A feladat');
  return customTaskItem(row as unknown as CustomTaskRow);
}

function checkRefs(db: DB, input: CustomTaskInput) {
  if (input.bed_id && !db.prepare('SELECT 1 FROM bed WHERE id = ?').get(input.bed_id)) throw bad('Az ágyás nem található.');
  if (input.planting_id && !db.prepare('SELECT 1 FROM planting WHERE id = ?').get(input.planting_id)) {
    throw bad('Az ültetés nem található.');
  }
}

export function createCustomTask(db: DB, input: CustomTaskInput): TaskItem {
  checkRefs(db, input);
  return getCustomTask(db, insert(db, 'custom_task', input));
}

export function updateCustomTask(db: DB, id: number, input: CustomTaskInput): TaskItem {
  checkRefs(db, input);
  const full = { bed_id: null, planting_id: null, notes: null, done_at: null, ...input };
  if (!update(db, 'custom_task', id, full)) throw notFound('A feladat');
  return getCustomTask(db, id);
}

export function deleteCustomTask(db: DB, id: number): void {
  if (!remove(db, 'custom_task', id)) throw notFound('A feladat');
}
