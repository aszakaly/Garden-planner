import type { DB } from '../db/index.ts';
import { transaction } from '../db/index.ts';
import { HttpError, insert } from '../db/helpers.ts';
import { carriedPlanting, defaultPlanYearStatus, harvestMovesToCarry, isCarryCandidate, type PlanYear } from '../../shared/domain/planYear.ts';
import type { PlanYearStatus } from '../../shared/labels.ts';
import type { PlanYearInput } from '../../shared/schemas.ts';
import type { GrowingWindow, PlantingListItem } from '../../shared/types.ts';
import { getPlanting, listPlantings } from './plantings.ts';

const currentYear = () => new Date().getFullYear();

export function getPlanYear(db: DB, year: number): PlanYear {
  const row = db.prepare('SELECT status, notes FROM plan_year WHERE year = ?').get(year) as
    | { status: PlanYearStatus; notes: string | null }
    | undefined;
  return row
    ? { year, status: row.status, notes: row.notes, stored: true }
    : { year, status: defaultPlanYearStatus(year, currentYear()), notes: null, stored: false };
}

export function savePlanYear(db: DB, year: number, input: PlanYearInput): PlanYear {
  db.prepare(
    `INSERT INTO plan_year (year, status, notes) VALUES (?, ?, ?)
     ON CONFLICT(year) DO UPDATE SET status = excluded.status, notes = excluded.notes`,
  ).run(year, input.status, input.notes ?? null);
  return getPlanYear(db, year);
}

/** Az előző évben álló évelők, amelyek még nincsenek áthozva ebbe az évbe. */
export function carryCandidates(db: DB, year: number): PlantingListItem[] {
  const carried = new Set(
    (db.prepare('SELECT carried_from_id AS id FROM planting WHERE year = ? AND carried_from_id IS NOT NULL').all(year) as { id: number }[]).map(
      (r) => r.id,
    ),
  );
  return listPlantings(db, { year: year - 1 }).filter((p) => isCarryCandidate(p, year) && !carried.has(p.id));
}

/** A kiválasztott évelők átvitele; a tervév ettől kezdve rögzített. */
export function carryOver(db: DB, year: number, ids: number[]): PlantingListItem[] {
  const candidates = new Map(carryCandidates(db, year).map((p) => [p.id, p]));
  const missing = ids.filter((id) => !candidates.has(id));
  if (missing.length) throw new HttpError(400, 'Ezek az ültetések nem vihetők át (már át vannak hozva, vagy nem évelők).');
  const windowOf = db.prepare('SELECT harvest_start FROM growing_window WHERE id = ?');
  const moveHarvest = db.prepare('UPDATE planting SET plan_harvest_start = NULL WHERE id = ?');

  const created = transaction(db, () => {
    if (!getPlanYear(db, year).stored) {
      db.prepare('INSERT INTO plan_year (year, status) VALUES (?, ?)').run(year, defaultPlanYearStatus(year, currentYear()));
    }
    return ids.map((id) => {
      const p = candidates.get(id)!;
      const window = p.window_id ? (windowOf.get(p.window_id) as Pick<GrowingWindow, 'harvest_start'> | undefined) : null;
      const carried = carriedPlanting(p, year, window);
      if (harvestMovesToCarry(p, year)) moveHarvest.run(p.id);
      return insert(db, 'planting', carried);
    });
  });
  return created.map((id) => getPlanting(db, id));
}
