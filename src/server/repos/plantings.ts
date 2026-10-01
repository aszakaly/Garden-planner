import { randomUUID } from 'node:crypto';
import type { DB } from '../db/index.ts';
import { transaction } from '../db/index.ts';
import { HttpError, insert, notFound, update } from '../db/helpers.ts';
import { seriesOffsets, shiftDates } from '../../shared/domain/dates.ts';
import { bedAxes, type Occupant } from '../../shared/domain/geometry.ts';
import { occupancyPeriod, placeSeries, placementOf } from '../../shared/domain/plantings.ts';
import type { PlantingCreateInput, PlantingInput } from '../../shared/schemas.ts';
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

/** Új ültetés; sorozatnál minden tag időben eltolva, a következő szabad sávba kerül. */
export function createPlantings(db: DB, input: PlantingCreateInput): PlantingListItem[] {
  const ids = transaction(db, () => {
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
  });
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

export function updatePlanting(db: DB, id: number, input: PlantingInput): PlantingListItem {
  transaction(db, () => {
    const data = normalize(db, input);
    if (!update(db, 'planting', id, { ...PLAN_DEFAULTS, ...data, updated_at: new Date().toISOString() })) {
      throw notFound('Az ültetés');
    }
  });
  return getPlanting(db, id);
}

/** Törlés; `wholeSeries` esetén a sorozat összes tagja. Visszaadja a törölt sorok számát. */
export function deletePlanting(db: DB, id: number, wholeSeries = false): number {
  const row = db.prepare('SELECT series_id FROM planting WHERE id = ?').get(id) as { series_id: string | null } | undefined;
  if (!row) throw notFound('Az ültetés');
  const result =
    wholeSeries && row.series_id
      ? db.prepare('DELETE FROM planting WHERE series_id = ?').run(row.series_id)
      : db.prepare('DELETE FROM planting WHERE id = ?').run(id);
  return Number(result.changes);
}
