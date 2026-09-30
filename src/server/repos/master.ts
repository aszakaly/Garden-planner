import type { DB } from '../db/index.ts';
import { HttpError, insert, notFound, remove, slugify, update } from '../db/helpers.ts';
import type {
  CompanionInput,
  CropGroupInput,
  FamilyInput,
  PlantInput,
  VarietyInput,
  WindowInput,
} from '../../shared/schemas.ts';
import type {
  CompanionView,
  CropGroup,
  GrowingWindow,
  Plant,
  PlantDetail,
  PlantFamily,
  PlantListItem,
  Variety,
  VarietyListItem,
} from '../../shared/types.ts';

type Row = Record<string, unknown>;

// --- Leképezések -------------------------------------------------------------

export function mapPlant(r: Row): Plant {
  return {
    ...(r as unknown as Plant),
    perennial: r.perennial === 1,
    frost_sensitive: r.frost_sensitive === 1,
    aliases_en: JSON.parse(String(r.aliases_en ?? '[]')),
  };
}

const mapWindow = (r: Row) => ({ ...r }) as unknown as GrowingWindow;

// --- Családok ---------------------------------------------------------------

export function listFamilies(db: DB): PlantFamily[] {
  return db
    .prepare(
      `SELECT f.*, (SELECT COUNT(*) FROM plant p WHERE p.family_id = f.id) AS plant_count
       FROM plant_family f ORDER BY f.name_hu COLLATE NOCASE`,
    )
    .all() as unknown as PlantFamily[];
}

export function createFamily(db: DB, input: FamilyInput): PlantFamily {
  const id = insert(db, 'plant_family', { ...input, code: uniqueCode(db, 'plant_family', input.name_hu) });
  return getFamily(db, id);
}

export function updateFamily(db: DB, id: number, input: FamilyInput): PlantFamily {
  if (!update(db, 'plant_family', id, input)) throw notFound('A család');
  return getFamily(db, id);
}

export function deleteFamily(db: DB, id: number): void {
  if (!remove(db, 'plant_family', id)) throw notFound('A család');
}

function getFamily(db: DB, id: number): PlantFamily {
  const row = db.prepare('SELECT * FROM plant_family WHERE id = ?').get(id);
  if (!row) throw notFound('A család');
  return row as unknown as PlantFamily;
}

// --- Zöldségcsoportok -------------------------------------------------------

export function listCropGroups(db: DB): CropGroup[] {
  return db
    .prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM plant p WHERE p.crop_group_id = g.id) AS plant_count
       FROM crop_group g ORDER BY g.sort_order, g.name_hu COLLATE NOCASE`,
    )
    .all() as unknown as CropGroup[];
}

export function createCropGroup(db: DB, input: CropGroupInput): CropGroup {
  const id = insert(db, 'crop_group', { ...input, code: uniqueCode(db, 'crop_group', input.name_hu) });
  return getCropGroup(db, id);
}

export function updateCropGroup(db: DB, id: number, input: CropGroupInput): CropGroup {
  if (!update(db, 'crop_group', id, input)) throw notFound('A zöldségcsoport');
  return getCropGroup(db, id);
}

export function deleteCropGroup(db: DB, id: number): void {
  if (!remove(db, 'crop_group', id)) throw notFound('A zöldségcsoport');
}

function getCropGroup(db: DB, id: number): CropGroup {
  const row = db.prepare('SELECT * FROM crop_group WHERE id = ?').get(id);
  if (!row) throw notFound('A zöldségcsoport');
  return row as unknown as CropGroup;
}

function uniqueCode(db: DB, table: string, name: string): string {
  const base = slugify(name) || 'elem';
  let code = base;
  for (let i = 2; db.prepare(`SELECT 1 FROM ${table} WHERE code = ?`).get(code); i++) code = `${base}_${i}`;
  return code;
}

// --- Növények ---------------------------------------------------------------

export function listPlants(db: DB): PlantListItem[] {
  const rows = db
    .prepare(
      `SELECT p.*, f.name_hu AS family_name, g.name_hu AS crop_group_name,
              (SELECT COUNT(*) FROM variety v WHERE v.plant_id = p.id) AS variety_count
       FROM plant p
       LEFT JOIN plant_family f ON f.id = p.family_id
       LEFT JOIN crop_group g ON g.id = p.crop_group_id
       ORDER BY p.name_hu COLLATE NOCASE`,
    )
    .all();
  const windows = db.prepare('SELECT * FROM growing_window WHERE plant_id IS NOT NULL ORDER BY id').all();
  const byPlant = Map.groupBy(windows.map(mapWindow), (w) => w.plant_id);
  return rows.map((r) => ({
    ...mapPlant(r),
    family_name: (r.family_name as string) ?? null,
    crop_group_name: (r.crop_group_name as string) ?? null,
    variety_count: Number(r.variety_count),
    windows: byPlant.get(Number(r.id)) ?? [],
  }));
}

export function getPlant(db: DB, id: number): Plant {
  const row = db.prepare('SELECT * FROM plant WHERE id = ?').get(id);
  if (!row) throw notFound('A növény');
  return mapPlant(row);
}

export function getPlantDetail(db: DB, id: number): PlantDetail {
  const plant = getPlant(db, id);
  const family = plant.family_id
    ? ((db.prepare('SELECT * FROM plant_family WHERE id = ?').get(plant.family_id) as unknown as PlantFamily) ?? null)
    : null;
  const crop_group = plant.crop_group_id
    ? ((db.prepare('SELECT * FROM crop_group WHERE id = ?').get(plant.crop_group_id) as unknown as CropGroup) ?? null)
    : null;
  const windows = db.prepare('SELECT * FROM growing_window WHERE plant_id = ? ORDER BY id').all(id).map(mapWindow);
  const varieties = (
    db
      .prepare(
        `SELECT v.*,
                (SELECT COUNT(*) FROM seed_stock s WHERE s.variety_id = v.id AND s.in_stock = 1) AS stock_count,
                (SELECT MAX(vintage_year) FROM seed_stock s WHERE s.variety_id = v.id AND s.in_stock = 1) AS latest_vintage
         FROM variety v WHERE v.plant_id = ? ORDER BY v.name COLLATE NOCASE`,
      )
      .all(id) as unknown as (Variety & { stock_count: number; latest_vintage: number | null })[]
  ).map((v) => ({
    ...v,
    stock_count: Number(v.stock_count),
    windows: db.prepare('SELECT * FROM growing_window WHERE variety_id = ? ORDER BY id').all(v.id).map(mapWindow),
  }));
  return { plant, family, crop_group, windows, varieties, companions: listCompanionsFor(db, id) };
}

export function createPlant(db: DB, input: PlantInput): Plant {
  const id = insert(db, 'plant', { ...input, code: uniqueCode(db, 'plant', input.name_hu) });
  return getPlant(db, id);
}

export function updatePlant(db: DB, id: number, input: Partial<PlantInput>): Plant {
  if (!update(db, 'plant', id, { ...input, updated_at: new Date().toISOString() })) throw notFound('A növény');
  return getPlant(db, id);
}

export function deletePlant(db: DB, id: number): void {
  const used = db.prepare('SELECT COUNT(*) AS n FROM planting WHERE plant_id = ?').get(id) as { n: number };
  if (used.n > 0) {
    throw new HttpError(409, `A növény ${used.n} ültetésben szerepel, ezért nem törölhető.`);
  }
  if (!remove(db, 'plant', id)) throw notFound('A növény');
}

// --- Időszakok --------------------------------------------------------------

export function createWindow(db: DB, owner: { plant_id?: number; variety_id?: number }, input: WindowInput): GrowingWindow {
  const id = insert(db, 'growing_window', { ...owner, ...input });
  return mapWindow(db.prepare('SELECT * FROM growing_window WHERE id = ?').get(id)!);
}

export function updateWindow(db: DB, id: number, input: WindowInput): GrowingWindow {
  // A teljes űrlap érkezik: a nem megadott mezők törlődnek.
  const full = {
    sow_start: null, sow_end: null, seedling_weeks: null, transplant_start: null, transplant_end: null,
    harvest_start: null, harvest_end: null, succession_days: null, notes: null,
    ...input,
  };
  if (!update(db, 'growing_window', id, full)) throw notFound('Az időszak');
  return mapWindow(db.prepare('SELECT * FROM growing_window WHERE id = ?').get(id)!);
}

export function deleteWindow(db: DB, id: number): void {
  if (!remove(db, 'growing_window', id)) throw notFound('Az időszak');
}

// --- Fajták -----------------------------------------------------------------

export function listVarieties(db: DB): VarietyListItem[] {
  return db
    .prepare(
      `SELECT v.*, p.name_hu AS plant_name FROM variety v JOIN plant p ON p.id = v.plant_id
       ORDER BY p.name_hu COLLATE NOCASE, v.name COLLATE NOCASE`,
    )
    .all() as unknown as VarietyListItem[];
}

export function createVariety(db: DB, plantId: number, input: VarietyInput): Variety {
  getPlant(db, plantId);
  try {
    const id = insert(db, 'variety', { ...input, plant_id: plantId });
    return db.prepare('SELECT * FROM variety WHERE id = ?').get(id) as unknown as Variety;
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Ilyen nevű fajta már van ennél a növénynél.');
    throw err;
  }
}

export function updateVariety(db: DB, id: number, input: VarietyInput): Variety {
  try {
    if (!update(db, 'variety', id, input)) throw notFound('A fajta');
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new HttpError(409, 'Ilyen nevű fajta már van ennél a növénynél.');
    throw err;
  }
  return db.prepare('SELECT * FROM variety WHERE id = ?').get(id) as unknown as Variety;
}

export function deleteVariety(db: DB, id: number): void {
  if (!remove(db, 'variety', id)) throw notFound('A fajta');
}

// --- Társítások -------------------------------------------------------------

export function listCompanionsFor(db: DB, plantId: number): CompanionView[] {
  return db
    .prepare(
      `SELECT c.id, c.relation, c.reason, c.source, c.evidence,
              p.id AS other_plant_id, p.name_hu AS other_plant_name
       FROM companion c
       JOIN plant p ON p.id = CASE WHEN c.plant_a_id = ? THEN c.plant_b_id ELSE c.plant_a_id END
       WHERE c.plant_a_id = ? OR c.plant_b_id = ?
       ORDER BY c.relation DESC, p.name_hu COLLATE NOCASE`,
    )
    .all(plantId, plantId, plantId)
    .map((r) => ({
      ...(r as unknown as CompanionView),
      evidence: r.evidence ? JSON.parse(String(r.evidence)) : null,
    }));
}

/** Kapcsolat mentése (létezőt felülír); a felhasználói bejegyzés forrása 'user'. */
export function upsertCompanion(db: DB, input: CompanionInput): void {
  const [a, b] = [input.plant_a_id, input.plant_b_id].sort((x, y) => x - y) as [number, number];
  getPlant(db, a);
  getPlant(db, b);
  db.prepare(
    `INSERT INTO companion (plant_a_id, plant_b_id, relation, reason, source)
     VALUES (?, ?, ?, ?, 'user')
     ON CONFLICT (plant_a_id, plant_b_id)
     DO UPDATE SET relation = excluded.relation, reason = excluded.reason, source = 'user'`,
  ).run(a, b, input.relation, input.reason ?? null);
}

export function deleteCompanion(db: DB, id: number): void {
  if (!remove(db, 'companion', id)) throw notFound('A társítás');
}

/** Az összes társítás tömören (a tervezési ellenőrzésekhez). */
export function allCompanions(db: DB): { a: number; b: number; relation: -1 | 0 | 1; reason: string | null }[] {
  return db
    .prepare('SELECT plant_a_id AS a, plant_b_id AS b, relation, reason FROM companion')
    .all() as unknown as { a: number; b: number; relation: -1 | 0 | 1; reason: string | null }[];
}
