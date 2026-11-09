import type { DB } from '../db/index.ts';
import { transaction } from '../db/index.ts';
import { HttpError, insert, notFound, remove, update } from '../db/helpers.ts';
import { numberedNames } from '../../shared/domain/beds.ts';
import { isArchived, planErrors, type GardenSize } from '../../shared/domain/gardenPlan.ts';
import { BED_NAME_MAX, type BedInput, type GardenInput, type GardenLayoutInput } from '../../shared/schemas.ts';
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

function getGarden(db: DB, id: number): Garden {
  const row = db.prepare('SELECT * FROM garden WHERE id = ?').get(id);
  if (!row) throw notFound('A kert');
  return row as unknown as Garden;
}

/** Teljes csere; a kisebbre állított kertbe az elhelyezett ágyásoknak bele kell férniük. */
export function updateGarden(db: DB, id: number, input: GardenInput): Garden {
  const full = { location: null, notes: null, length_cm: null, width_cm: null, ...input };
  return transaction(db, () => {
    const before = getGarden(db, id);
    const hadSize = before.length_cm != null && before.width_cm != null;
    const hasSize = full.length_cm != null && full.width_cm != null;
    if (!hadSize && hasSize) {
      // Méret nélkül a helyeknek nem volt kerete (régi kézi adat, régi mentés): az alaprajz üresen indul
      db.prepare('UPDATE bed SET pos_x_cm = NULL, pos_y_cm = NULL WHERE garden_id = ?').run(id);
    }
    if (hadSize && !hasSize && planBeds(db, id).some((b) => b.pos_x_cm != null)) {
      throw new HttpError(400, 'A kert mérete nem törölhető, amíg ágyás áll az alaprajzon. Előbb vedd le őket a rajzról.');
    }
    update(db, 'garden', id, full);
    assertPlanValid(db, id, 'A kert mérete nem menthető');
    return getGarden(db, id);
  });
}

/** A kert alaprajzán látható (nem archív) ágyások. */
function planBeds(db: DB, gardenId: number): Bed[] {
  const year = new Date().getFullYear();
  return (db.prepare('SELECT * FROM bed WHERE garden_id = ?').all(gardenId) as unknown as Bed[]).filter((b) => !isArchived(b, year));
}

const gardenSize = (g: Garden): GardenSize | null =>
  g.length_cm != null && g.width_cm != null ? { length_cm: g.length_cm, width_cm: g.width_cm } : null;

/**
 * Hibát dob, ha a kertben kilógó vagy egymást átfedő ágyás van. Méret nélküli kertnél nincs alaprajz,
 * a tárolt helyeknek nincs jelentése, így nincs mit ellenőrizni.
 */
function assertPlanValid(db: DB, gardenId: number, prefix: string): void {
  const size = gardenSize(getGarden(db, gardenId));
  if (!size) return;
  const errors = planErrors(planBeds(db, gardenId), size);
  if (errors.length) throw new HttpError(400, `${prefix}: ${errors.join(' ')}`);
}

/** Az alaprajz mentése egy tranzakcióban: a felsorolt ágyások helye és elforgatása. */
export function saveGardenLayout(db: DB, gardenId: number, input: GardenLayoutInput): Bed[] {
  return transaction(db, () => {
    if (!gardenSize(getGarden(db, gardenId)) && input.beds.some((b) => b.pos_x_cm != null)) {
      throw new HttpError(400, 'Az alaprajz nem menthető: előbb add meg a kert méretét.');
    }
    const stmt = db.prepare('UPDATE bed SET pos_x_cm = ?, pos_y_cm = ?, rotation_deg = ? WHERE id = ? AND garden_id = ?');
    for (const b of input.beds) {
      if ((b.pos_x_cm == null) !== (b.pos_y_cm == null)) throw new HttpError(400, 'Az ágyás helyéhez mindkét koordináta kell.');
      if (Number(stmt.run(b.pos_x_cm, b.pos_y_cm, b.rotation_deg, b.id, gardenId).changes) === 0) {
        throw new HttpError(404, 'Az ágyás nem található ebben a kertben. Frissítsd az oldalt.');
      }
    }
    assertPlanValid(db, gardenId, 'Az alaprajz nem menthető');
    return planBeds(db, gardenId);
  });
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

/** `count` egyforma ágyás sorszámozott névvel, a lista végére, egy tranzakcióban; elhelyezetlenül. */
export function createBeds(db: DB, input: BedInput, count: number): Bed[] {
  return transaction(db, () => {
    const taken = (db.prepare('SELECT name FROM bed').all() as { name: string }[]).map((r) => r.name);
    const names = numberedNames(input.name, count, taken);
    if (names.some((n) => n.length > BED_NAME_MAX)) {
      throw new HttpError(400, `A sorszámozott név legfeljebb ${BED_NAME_MAX} karakter lehet. Rövidítsd a nevet.`);
    }
    return names.map((name) => createBed(db, { ...input, name, sort_order: 0 }));
  });
}

/**
 * A helyét és az elforgatását nem érinti (azt az alaprajz menti); az új méretnek el kell férnie.
 * Kivétel: az archívból visszaállított ágyás lekerül a rajzról, ha a régi helyén már nem fér el.
 */
export function updateBed(db: DB, id: number, input: BedInput): Bed {
  const full = { sun: null, soil: null, irrigation: null, notes: null, active_from_year: null, active_to_year: null, ...input };
  return transaction(db, () => {
    const before = getBed(db, id);
    update(db, 'bed', id, full);
    let bed = getBed(db, id);
    if (bed.pos_x_cm == null) return bed;
    // Archívból visszaállítva a régi helyén közben másik ágyás állhat: ilyenkor lekerül a rajzról
    const year = new Date().getFullYear();
    if (isArchived(before, year) && !isArchived(bed, year)) {
      const size = gardenSize(getGarden(db, bed.garden_id));
      if (size && planErrors(planBeds(db, bed.garden_id), size).length) {
        db.prepare('UPDATE bed SET pos_x_cm = NULL, pos_y_cm = NULL WHERE id = ?').run(id);
        bed = getBed(db, id);
      }
    }
    if (bed.pos_x_cm != null) assertPlanValid(db, bed.garden_id, 'Az ágyás nem menthető a kertbeli helyén');
    return bed;
  });
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
