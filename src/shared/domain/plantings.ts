import type { Planting, PlantingListItem } from '../types.ts';
import { bedStart, DEFAULT_HARVEST_DAYS, type PlantingDates } from './dates.ts';
import { bedAxes, firstFreeStart, type BedGeometry, type Occupant, type Period, type Placement } from './geometry.ts';
import { addDaysISO } from './isoDate.ts';

type Timed = Pick<
  Planting,
  | 'year'
  | 'method'
  | 'status'
  | 'plan_sow_date'
  | 'plan_transplant_date'
  | 'plan_harvest_start'
  | 'plan_end_date'
  | 'actual_sow_date'
  | 'actual_transplant_date'
  | 'actual_harvest_start'
  | 'actual_end_date'
> & {
  carried_from_id?: number | null;
  perennial?: boolean;
};

export function planDates(p: Timed): PlantingDates {
  return { sow: p.plan_sow_date, transplant: p.plan_transplant_date, harvestStart: p.plan_harvest_start, end: p.plan_end_date };
}

/** A tény dátum, ha már megvan, egyébként a tervezett. */
export function effectiveDates(p: Timed): PlantingDates {
  return {
    sow: p.actual_sow_date ?? p.plan_sow_date,
    transplant: p.actual_transplant_date ?? p.plan_transplant_date,
    harvestStart: p.actual_harvest_start ?? p.plan_harvest_start,
    end: p.actual_end_date ?? p.plan_end_date,
  };
}

/**
 * Mettől meddig foglalja az ültetés az ágyást. Ha a vége nem ismert, a betakarítás
 * kezdete után még egy hónapig, ennek híján (és évelőnél mindig) az év végéig számolunk vele.
 * Az előző évből áthozott évelő január 1-jétől áll a helyén.
 * Az elmaradt ültetés nem foglal helyet; dátum nélküli (gyors előzmény) sem.
 */
export function occupancyPeriod(p: Timed): Period | null {
  if (p.status === 'elmaradt') return null;
  const d = effectiveDates(p);
  const start =
    (p.method ? bedStart(p.method, d) : null) ?? d.transplant ?? d.sow ?? (p.carried_from_id ? `${p.year}-01-01` : null);
  if (!start) return null;
  const end = d.end ?? (d.harvestStart && !p.perennial ? addDaysISO(d.harvestStart, DEFAULT_HARVEST_DAYS) : `${p.year}-12-31`);
  return { start, end: end < start ? start : end };
}

export const effectiveBedId = (p: Pick<Planting, 'bed_id' | 'actual_bed_id'>) => p.actual_bed_id ?? p.bed_id;

type Placed = Pick<
  Planting,
  | 'axis_start_cm'
  | 'axis_span_cm'
  | 'cross_start_cm'
  | 'cross_span_cm'
  | 'actual_axis_start_cm'
  | 'actual_axis_span_cm'
  | 'actual_cross_start_cm'
  | 'actual_cross_span_cm'
>;

/** Az ültetés helye az ágyásban (a ténylegeset előnyben részesítve); null, ha nincs elhelyezve. */
export function placementOf(p: Placed, bed: BedGeometry): Placement | null {
  const actual = p.actual_axis_start_cm != null && p.actual_axis_span_cm != null;
  const axisStart = actual ? p.actual_axis_start_cm : p.axis_start_cm;
  const axisSpan = actual ? p.actual_axis_span_cm : p.axis_span_cm;
  if (axisStart == null || axisSpan == null) return null;
  const { cross } = bedAxes(bed);
  return {
    axis_start_cm: axisStart,
    axis_span_cm: axisSpan,
    cross_start_cm: (actual ? p.actual_cross_start_cm : p.cross_start_cm) ?? 0,
    cross_span_cm: (actual ? p.actual_cross_span_cm : p.cross_span_cm) ?? cross,
  };
}

/**
 * Újravetés-sorozat elhelyezése: az első tag a megadott helyre kerül, a többi
 * (időben eltolva) mindig az első olyan sávba, amely akkor épp szabad.
 * Ha nincs szabad hely, az első tag helyére kerül (ezt az ütközésjelzés mutatja).
 */
export function placeSeries(first: Occupant, offsets: number[], axisLength: number, others: Occupant[]): Occupant[] {
  const taken = [...others];
  const cross = { start: first.placement.cross_start_cm, span: first.placement.cross_span_cm };
  return offsets.map((offset, i) => {
    const period = { start: addDaysISO(first.period.start, offset), end: addDaysISO(first.period.end, offset) };
    let placement = first.placement;
    if (i > 0) {
      const start = firstFreeStart(axisLength, taken, period, first.placement.axis_span_cm, cross);
      if (start !== null) placement = { ...first.placement, axis_start_cm: start };
    }
    const item = { placement, period };
    taken.push(item);
    return item;
  });
}

/** Üres ültetés-sablon (a szerkesztő élő ellenőrzéséhez épített „virtuális” ültetéshez). */
export function blankPlanting(): PlantingListItem {
  return {
    id: -1, year: 0, plant_id: 0, variety_id: null, seed_stock_id: null, bed_id: null,
    axis_start_cm: null, axis_span_cm: null, cross_start_cm: null, cross_span_cm: null, rows: null, plant_count: null,
    method: null, window_id: null,
    plan_sow_date: null, plan_transplant_date: null, plan_harvest_start: null, plan_end_date: null,
    actual_sow_date: null, actual_transplant_date: null, actual_harvest_start: null, actual_end_date: null,
    actual_bed_id: null, actual_axis_start_cm: null, actual_axis_span_cm: null, actual_cross_start_cm: null, actual_cross_span_cm: null,
    status: 'terv', is_history: false, series_id: null, series_index: null, carried_from_id: null,
    eval_success: null, eval_yield: null, eval_recommend: null, eval_notes: null, notes: null,
    plant_name: '', variety_name: null, family_id: null, family_name: null,
    crop_group_id: null, crop_group_code: null, crop_group_name: null,
    rotation_stage: null, nutrient_group: null, perennial: false, frost_sensitive: false,
    in_row_spacing_cm: null, row_spacing_cm: null, days_to_harvest: null, harvest_duration_days: null, seed_viability_years: null,
    bed_name: null, bed_color: null, seed_vintage: null, has_seed: false, series_size: null,
  };
}
