import { randomUUID } from 'node:crypto';
import type { DB } from '../db/index.ts';
import { transaction } from '../db/index.ts';
import { HttpError, insert, notFound, update } from '../db/helpers.ts';
import { DATE_FIELDS, seriesOffsets, shiftDates, type DateField, type PlantingDates } from '../../shared/domain/dates.ts';
import { bedAxes, type Occupant } from '../../shared/domain/geometry.ts';
import { occupancyPeriod, placeSeries, placementOf } from '../../shared/domain/plantings.ts';
import { ACTUAL_COLUMN, statusFromActuals, TASK_SLOTS, taskKey } from '../../shared/domain/tasks.ts';
import type { PlantingActualInput, PlantingBatchInput, PlantingCreateInput, PlantingInput } from '../../shared/schemas.ts';
import type { PlantingListItem } from '../../shared/types.ts';
import { getBed } from './garden.ts';

type Row = Record<string, unknown>;

const SELECT = `
  SELECT p.*,
         pl.name_hu AS plant_name, v.name AS variety_name,
         pl.family_id, f.name_hu AS family_name,
         pl.crop_group_id, g.code AS crop_group_code, g.name_hu AS crop_group_name,
         pl.rotation_stage, pl.nutrient_group, pl.perennial, pl.frost_sensitive,
         COALESCE(v.in_row_spacing_cm, pl.in_row_spacing_cm) AS in_row_spacing_cm,
         COALESCE(v.row_spacing_cm, pl.row_spacing_cm) AS row_spacing_cm,
         COALESCE(v.days_to_harvest, pl.days_to_harvest) AS days_to_harvest,
         pl.harvest_duration_days, pl.seed_viability_years,
         b.name AS bed_name, b.color AS bed_color,
         s.vintage_year AS seed_vintage,
         CASE WHEN p.variety_id IS NOT NULL
              THEN EXISTS (SELECT 1 FROM seed_stock x WHERE x.variety_id = p.variety_id AND x.in_stock = 1)
              ELSE EXISTS (SELECT 1 FROM seed_stock x JOIN variety xv ON xv.id = x.variety_id
                           WHERE xv.plant_id = p.plant_id AND x.in_stock = 1)
         END AS has_seed,
         CASE WHEN p.series_id IS NULL THEN NULL
              ELSE (SELECT COUNT(*) FROM planting q WHERE q.series_id = p.series_id)
         END AS series_size
  FROM planting p
  JOIN plant pl ON pl.id = p.plant_id
  LEFT JOIN variety v ON v.id = p.variety_id
  LEFT JOIN plant_family f ON f.id = pl.family_id
  LEFT JOIN crop_group g ON g.id = pl.crop_group_id
  LEFT JOIN bed b ON b.id = COALESCE(p.actual_bed_id, p.bed_id)
  LEFT JOIN seed_stock s ON s.id = p.seed_stock_id`;

function mapPlanting(r: Row): PlantingListItem {
  return {
    ...(r as unknown as PlantingListItem),
    is_history: r.is_history === 1,
    perennial: r.perennial === 1,
    frost_sensitive: r.frost_sensitive === 1,
    has_seed: r.has_seed === 1,
    series_size: r.series_size == null ? null : Number(r.series_size),
  };
}

export interface PlantingFilter {
  year: number;
  /** Ha meg van adva, a `fromYear`–`year` közötti összes év ültetései (vetésforgó-előzményekhez) */
  fromYear?: number;
  bedId?: number;
}

/**
 * Az év ültetései, valamint a korábbi években kezdett, de ebbe az évbe átnyúlók
 * (pl. ősszel ültetett fokhagyma) – az ágyás-idővonalhoz ezek is kellenek.
 */
export function listPlantings(db: DB, { year, fromYear, bedId }: PlantingFilter): PlantingListItem[] {
  const from = Math.min(fromYear ?? year, year);
  const where = [`((p.year BETWEEN ? AND ?) OR (p.year < ? AND COALESCE(p.actual_end_date, p.plan_end_date) > ?))`];
  const params: (number | string)[] = [from, year, from, `${from}-01-01`];
  if (bedId) {
    where.push('COALESCE(p.actual_bed_id, p.bed_id) = ?');
    params.push(bedId);
  }
  return db
    .prepare(
      `${SELECT} WHERE ${where.join(' AND ')}
       ORDER BY p.year, COALESCE(p.actual_transplant_date, p.plan_transplant_date, p.actual_sow_date, p.plan_sow_date), p.id`,
    )
    .all(...params)
    .map(mapPlanting);
}

export function getPlanting(db: DB, id: number): PlantingListItem {
  const row = db.prepare(`${SELECT} WHERE p.id = ?`).get(id);
  if (!row) throw notFound('Az ültetés');
  return mapPlanting(row);
}

const bad = (message: string) => new HttpError(400, message);

/** Hivatkozások ellenőrzése; a vetőmagtételből a fajta is kiderül. */
function normalize<T extends PlantingInput>(db: DB, input: T): T {
  const out = { ...input };
  if (!db.prepare('SELECT 1 FROM plant WHERE id = ?').get(out.plant_id)) throw bad('A növény nem található.');

  if (out.seed_stock_id) {
    const stock = db.prepare('SELECT variety_id FROM seed_stock WHERE id = ?').get(out.seed_stock_id) as
      | { variety_id: number }
      | undefined;
    if (!stock) throw bad('A vetőmagtétel nem található.');
    if (out.variety_id && out.variety_id !== stock.variety_id) {
      throw bad('A kiválasztott vetőmagtétel nem ehhez a fajtához tartozik.');
    }
    out.variety_id = stock.variety_id;
  }
  if (out.variety_id) {
    const variety = db.prepare('SELECT plant_id FROM variety WHERE id = ?').get(out.variety_id) as
      | { plant_id: number }
      | undefined;
    if (!variety) throw bad('A fajta nem található.');
    if (variety.plant_id !== out.plant_id) throw bad('A fajta nem ehhez a növényhez tartozik.');
  }
  if (out.bed_id && !db.prepare('SELECT 1 FROM bed WHERE id = ?').get(out.bed_id)) {
    throw bad('Az ágyás nem található.');
  }
  if (out.window_id) {
    const w = db
      .prepare('SELECT w.plant_id, v.plant_id AS variety_plant_id FROM growing_window w LEFT JOIN variety v ON v.id = w.variety_id WHERE w.id = ?')
      .get(out.window_id) as { plant_id: number | null; variety_plant_id: number | null } | undefined;
    if (!w) throw bad('A termesztési időszak nem található.');
    if ((w.plant_id ?? w.variety_plant_id) !== out.plant_id) {
      throw bad('A termesztési időszak nem ehhez a növényhez tartozik.');
    }
  }
  return out;
}

/** A PUT teljes csere: ami nem jött, az üres lesz (a tény adatokat és a státuszt nem érinti). */
const PLAN_DEFAULTS = {
  variety_id: null,
  seed_stock_id: null,
  bed_id: null,
  axis_start_cm: null,
  axis_span_cm: null,
  cross_start_cm: null,
  cross_span_cm: null,
  rows: null,
  plant_count: null,
  method: null,
  window_id: null,
  plan_sow_date: null,
  plan_transplant_date: null,
  plan_harvest_start: null,
  plan_end_date: null,
  notes: null,
};

const NO_ACTUALS = {
  status: 'terv' as const,
  actual_sow_date: null,
  actual_transplant_date: null,
  actual_harvest_start: null,
  actual_end_date: null,
};

/** Az ágyás többi ültetése foglaltságként (a sorozat elhelyezéséhez). */
function occupantsInBed(db: DB, year: number, bedId: number): Occupant[] {
  const bed = getBed(db, bedId);
  return listPlantings(db, { year, bedId }).flatMap((p) => {
    const placement = placementOf(p, bed);
    const period = occupancyPeriod(p);
    return placement && period ? [{ id: p.id, placement, period }] : [];
  });
}

/**
 * Új ültetés(ek) tranzakció nélkül – a hívó fogja tranzakcióba. Sorozatnál minden tag
 * időben eltolva, a következő szabad sávba kerül.
 */
function insertPlantings(db: DB, input: PlantingCreateInput): number[] {
  const { series, ...fields } = normalize(db, input);
  // A gyors előzmény már megtörtént ültetés
  const base = { ...fields, status: fields.is_history ? ('lezart' as const) : ('terv' as const) };
  if (!series) return [insert(db, 'planting', base)];

  const offsets = seriesOffsets(series.count, series.interval_days);
  let starts = offsets.map(() => base.axis_start_cm ?? null);
  const planned = pickPlanDates(base);
  const period = occupancyPeriod({ year: base.year, method: base.method ?? null, ...planned, ...NO_ACTUALS });
  if (base.bed_id && base.axis_start_cm != null && base.axis_span_cm != null && period) {
    const bed = getBed(db, base.bed_id);
    const { axis, cross } = bedAxes(bed);
    const first = {
      placement: {
        axis_start_cm: base.axis_start_cm,
        axis_span_cm: base.axis_span_cm,
        cross_start_cm: base.cross_start_cm ?? 0,
        cross_span_cm: base.cross_span_cm ?? cross,
      },
      period,
    };
    starts = placeSeries(first, offsets, axis, occupantsInBed(db, base.year, base.bed_id)).map(
      (o) => o.placement.axis_start_cm,
    );
  }

  const seriesId = randomUUID();
  const dates = {
    sow: planned.plan_sow_date,
    transplant: planned.plan_transplant_date,
    harvestStart: planned.plan_harvest_start,
    end: planned.plan_end_date,
  };
  return offsets.map((offset, i) => {
    const d = shiftDates(dates, offset);
    return insert(db, 'planting', {
      ...base,
      axis_start_cm: starts[i],
      plan_sow_date: d.sow,
      plan_transplant_date: d.transplant,
      plan_harvest_start: d.harvestStart,
      plan_end_date: d.end,
      series_id: seriesId,
      series_index: i + 1,
    });
  });
}

/** Új ültetés; sorozatnál minden tag időben eltolva, a következő szabad sávba kerül. */
export function createPlantings(db: DB, input: PlantingCreateInput): PlantingListItem[] {
  const ids = transaction(db, () => insertPlantings(db, input));
  return ids.map((id) => getPlanting(db, id));
}

function pickPlanDates(p: PlantingInput) {
  return {
    plan_sow_date: p.plan_sow_date ?? null,
    plan_transplant_date: p.plan_transplant_date ?? null,
    plan_harvest_start: p.plan_harvest_start ?? null,
    plan_end_date: p.plan_end_date ?? null,
  };
}

/**
 * A tényleges megvalósulás (dátumok, hely, státusz) és a szezonvégi értékelés módosítása.
 * Ha a státusz nincs megadva, de a tény dátumok változnak, a státusz azokból adódik.
 */
export function updatePlantingActual(db: DB, id: number, input: PlantingActualInput): PlantingListItem {
  const current = getPlanting(db, id);
  if (input.actual_bed_id && !db.prepare('SELECT 1 FROM bed WHERE id = ?').get(input.actual_bed_id)) {
    throw bad('Az ágyás nem található.');
  }
  const data: Record<string, unknown> = { ...input };
  const datesChanged = DATE_FIELDS.some((f) => input[ACTUAL_COLUMN[f]] !== undefined);
  if (!input.status && datesChanged) {
    const pick = (f: DateField) => (input[ACTUAL_COLUMN[f]] !== undefined ? (input[ACTUAL_COLUMN[f]] ?? null) : current[ACTUAL_COLUMN[f]]);
    const actual: PlantingDates = { sow: pick('sow'), transplant: pick('transplant'), harvestStart: pick('harvestStart'), end: pick('end') };
    data.status = statusFromActuals(current.status, actual);
  }
  update(db, 'planting', id, { ...data, updated_at: new Date().toISOString() });
  return getPlanting(db, id);
}

/** Egy növény (vagy fajta) összes ültetése minden évből, a legutóbbi elöl – a tudásbázis-nézetekhez. */
export function plantingHistory(db: DB, { plantId, varietyId }: { plantId?: number; varietyId?: number }): PlantingListItem[] {
  const where = varietyId ? 'p.variety_id = ?' : 'p.plant_id = ?';
  return db
    .prepare(
      `${SELECT} WHERE ${where}
       ORDER BY p.year DESC, COALESCE(p.actual_transplant_date, p.plan_transplant_date, p.actual_sow_date, p.plan_sow_date) DESC, p.id DESC`,
    )
    .all(varietyId ?? plantId ?? 0)
    .map(mapPlanting);
}

/** A terv teljes cseréje tranzakció nélkül (a tény adatokat és a státuszt nem érinti). */
function replacePlanting(db: DB, id: number, input: PlantingInput): void {
  const data = normalize(db, input);
  if (!update(db, 'planting', id, { ...PLAN_DEFAULTS, ...data, updated_at: new Date().toISOString() })) {
    throw notFound('Az ültetés');
  }
}

export function updatePlanting(db: DB, id: number, input: PlantingInput): PlantingListItem {
  transaction(db, () => replacePlanting(db, id, input));
  return getPlanting(db, id);
}

/** Törlés tranzakció nélkül; `wholeSeries` esetén a sorozat összes tagja. A törölt sorok száma. */
function removePlantings(db: DB, id: number, wholeSeries: boolean): number {
  const row = db.prepare('SELECT series_id FROM planting WHERE id = ?').get(id) as { series_id: string | null } | undefined;
  if (!row) throw notFound('Az ültetés');
  const ids =
    wholeSeries && row.series_id
      ? (db.prepare('SELECT id FROM planting WHERE series_id = ?').all(row.series_id) as { id: number }[]).map((r) => r.id)
      : [id];
  const del = db.prepare('DELETE FROM planting WHERE id = ?');
  const delState = db.prepare('DELETE FROM task_state WHERE task_key = ?');
  let changes = 0;
  for (const pid of ids) {
    changes += Number(del.run(pid).changes);
    // A generált feladatok állapota (áthelyezés, megjegyzés) is megy
    for (const slot of TASK_SLOTS) if (slot !== 'beszerzes') delState.run(taskKey(slot, pid));
  }
  return changes;
}

/** Törlés; `wholeSeries` esetén a sorozat összes tagja. Visszaadja a törölt sorok számát. */
export function deletePlanting(db: DB, id: number, wholeSeries = false): number {
  return transaction(db, () => removePlantings(db, id, wholeSeries));
}

/**
 * Tömeges mentés a kiosztás-szerkesztőből: törlés, módosítás, majd létrehozás egyetlen
 * tranzakcióban – egy hibás elemnél semmi sem változik. A létrehozottak azonosítói a kérés sorrendjében.
 * A közben máshol már törölt ültetések törlését kihagyja; megkezdett vagy rögzített ültetés nem törölhető.
 * Egy létrehozott azonosító egyezhet ugyanebben a kérésben törölttel (a `planting.id` nem AUTOINCREMENT);
 * ez biztonságos, mert a törölt azonosítóra mutató minden hivatkozás (feladatállapot, kapcsolt sorok) előbb törlődik.
 */
export function savePlantingBatch(db: DB, input: PlantingBatchInput): { created: number[] } {
  return transaction(db, () => {
    for (const id of input.delete) {
      const row = db.prepare('SELECT * FROM planting WHERE id = ?').get(id) as Row | undefined;
      if (!row) continue; // máshol már törölték
      const started =
        row.is_history ||
        row.status !== 'terv' ||
        [row.actual_sow_date, row.actual_transplant_date, row.actual_harvest_start, row.actual_end_date, row.actual_axis_start_cm].some(
          (v) => v != null,
        );
      if (started) throw bad('Megkezdett vagy rögzített ültetés a kiosztásból nem törölhető; a részletes lapon törölhető.');
      removePlantings(db, id, false);
    }
    for (const u of input.update) replacePlanting(db, u.id, u.data);
    return { created: input.create.flatMap((c) => insertPlantings(db, { ...c, series: null })) };
  });
}
