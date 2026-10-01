import type { DB } from '../db/index.ts';
import { transaction } from '../db/index.ts';
import { HttpError, insert, notFound, remove, update } from '../db/helpers.ts';
import { numberedNames } from '../../shared/domain/beds.ts';
import type { BedInput, GardenInput } from '../../shared/schemas.ts';
import type { Bed, BedListItem, Garden } from '../../shared/types.ts';

// --- Kert -------------------------------------------------------------------

export function listGardens(db: DB): Garden[] {
  return db.prepare('SELECT * FROM garden ORDER BY id').all() as unknown as Garden[];
}

/** Az alapértelmezett (első) kert; ha nincs, létrehozza. */
export function defaultGardenId(db: DB): number {
  const row = db.prepare('SELECT id FROM garden ORDER BY id LIMIT 1').get() as { id: number } | undefined;
  return row?.id ?? insert(db, 'garden', { name: 'Kertem' });
}

export function updateGarden(db: DB, id: number, input: GardenInput): Garden {
  if (!update(db, 'garden', id, input)) throw notFound('A kert');
  return db.prepare('SELECT * FROM garden WHERE id = ?').get(id) as unknown as Garden;
}

// --- Ágyások ----------------------------------------------------------------

const isActive = (b: Bed, year: number) =>
  (b.active_from_year == null || b.active_from_year <= year) && (b.active_to_year == null || b.active_to_year >= year);

/** Ágyások az adott év ültetésszámával; `onlyActive` esetén csak az abban az évben használtak. */
export function listBeds(db: DB, year: number, onlyActive = false): BedListItem[] {
  const rows = db
    .prepare(
      `SELECT b.*,
              (SELECT COUNT(*) FROM planting p
               WHERE COALESCE(p.actual_bed_id, p.bed_id) = b.id AND p.year = ?) AS planting_count
       FROM bed b ORDER BY b.sort_order, b.name COLLATE NOCASE`,
    )
    .all(year) as unknown as (Bed & { planting_count: number })[];
  return rows
    .map((b) => ({ ...b, planting_count: Number(b.planting_count), active: isActive(b, year) }))
    .filter((b) => !onlyActive || b.active);
}

export function getBed(db: DB, id: number): Bed {
  const row = db.prepare('SELECT * FROM bed WHERE id = ?').get(id);
  if (!row) throw notFound('Az ágyás');
  return row as unknown as Bed;
}

export function createBed(db: DB, input: BedInput): Bed {
  const garden_id = input.garden_id ?? defaultGardenId(db);
  const sort_order =
    input.sort_order ||
    Number((db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 10 AS n FROM bed').get() as { n: number }).n);
  return getBed(db, insert(db, 'bed', { ...input, garden_id, sort_order }));
}

/** `count` egyforma ágyás sorszámozott névvel, a lista végére, egy tranzakcióban. */
export function createBeds(db: DB, input: BedInput, count: number): Bed[] {
  return transaction(db, () => {
    const taken = (db.prepare('SELECT name FROM bed').all() as { name: string }[]).map((r) => r.name);
    return numberedNames(input.name, count, taken).map((name) => createBed(db, { ...input, name, sort_order: 0 }));
  });
}

export function updateBed(db: DB, id: number, input: BedInput): Bed {
  const full = { pos_x_cm: null, pos_y_cm: null, sun: null, soil: null, irrigation: null, notes: null,
    active_from_year: null, active_to_year: null, ...input };
  if (!update(db, 'bed', id, full)) throw notFound('Az ágyás');
  return getBed(db, id);
}

export function deleteBed(db: DB, id: number): void {
  const used = db
    .prepare('SELECT COUNT(*) AS n FROM planting WHERE bed_id = ? OR actual_bed_id = ?')
    .get(id, id) as { n: number };
  if (used.n > 0) {
    throw new HttpError(
      409,
      `Az ágyáshoz ${used.n} ültetés tartozik. Törlés helyett add meg a „Használat vége” évet, így a vetésforgó-előzmények megmaradnak.`,
    );
  }
  if (!remove(db, 'bed', id)) throw notFound('Az ágyás');
}
