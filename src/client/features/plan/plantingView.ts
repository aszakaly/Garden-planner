import { PLANTING_METHOD_LABEL } from '@shared/labels.ts';
import { bedStart } from '@shared/domain/dates.ts';
import { effectiveBedId, effectiveDates, occupancyPeriod, placementOf } from '@shared/domain/plantings.ts';
import { bedAxes, estimatePlantCount, type BedGeometry, type Occupant } from '@shared/domain/geometry.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import type { Bed, PlantingListItem } from '@shared/types.ts';

export { effectiveBedId };

export const plantingTitle = (p: Pick<PlantingListItem, 'plant_name' | 'variety_name'>) =>
  p.variety_name ? `${p.plant_name} – ${p.variety_name}` : p.plant_name;

/** Az ágyásba kerülés napja (rendezéshez); dátum nélkül null. */
export function startOf(p: PlantingListItem): string | null {
  const d = effectiveDates(p);
  return (p.method ? bedStart(p.method, d) : null) ?? d.transplant ?? d.sow;
}

/** Az első teendő napja: palántánál a tálcás vetés. */
export function firstActionOf(p: PlantingListItem): string | null {
  const d = effectiveDates(p);
  return d.sow ?? d.transplant ?? d.harvestStart;
}

export function byStart(a: PlantingListItem, b: PlantingListItem): number {
  return (startOf(a) ?? '9999').localeCompare(startOf(b) ?? '9999') || a.id - b.id;
}

/** Rövid dátum; ha nem a megjelenített évre esik, az évvel együtt („2026. okt. 1.”). */
export function dateInYear(iso: string, year: number): string {
  return iso.startsWith(`${year}-`) ? shortDate(iso) : `${iso.slice(0, 4)}. ${shortDate(iso)}`;
}

/** „Saját palánta · vetés márc. 15. · kiültetés máj. 10. · szedés júl. 14.–okt. 12.” */
export function datesSummary(p: PlantingListItem, year: number): string {
  const d = effectiveDates(p);
  const f = (iso: string) => dateInYear(iso, year);
  const parts: string[] = [];
  if (p.method === 'palanta' || p.method === 'vasarolt_palanta') parts.push(PLANTING_METHOD_LABEL[p.method]);
  if (d.sow && p.method !== 'vasarolt_palanta') {
    const verb = p.method === 'ultetes' ? 'ültetés' : p.method === 'helyrevetes' ? 'helyrevetés' : 'vetés';
    parts.push(`${verb} ${f(d.sow)}`);
  }
  if (d.transplant) parts.push(`kiültetés ${f(d.transplant)}`);
  if (d.harvestStart) parts.push(`szedés ${f(d.harvestStart)}${d.end ? `–${f(d.end)}` : ' után'}`);
  if (!d.sow && !d.transplant && !d.harvestStart) parts.push(p.method ? `${PLANTING_METHOD_LABEL[p.method]}, dátum nélkül` : 'dátum nélkül');
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });

/** „0–80 cm · 2 sor · kb. 4 tő” */
export function placementSummary(p: PlantingListItem, bed: BedGeometry | undefined): string | null {
  const parts: string[] = [];
  const placement = bed ? placementOf(p, bed) : null;
  if (placement) {
    parts.push(`${nf.format(placement.axis_start_cm)}–${nf.format(placement.axis_start_cm + placement.axis_span_cm)} cm`);
  }
  if (p.rows) parts.push(`${p.rows} sor`);
  const count =
    p.plant_count ??
    (placement ? estimatePlantCount(p.rows, placement.cross_span_cm, p.in_row_spacing_cm) : null);
  if (count) parts.push(p.plant_count ? `${count} tő` : `kb. ${count} tő`);
  return parts.length ? parts.join(' · ') : null;
}

export interface PlacedPlanting extends Occupant {
  id: number;
  planting: PlantingListItem;
}

/** Az ágyás elhelyezett és dátumozott ültetései. */
export function placedInBed(plantings: PlantingListItem[], bed: Bed): PlacedPlanting[] {
  return plantings.flatMap((p) => {
    if (effectiveBedId(p) !== bed.id) return [];
    const placement = placementOf(p, bed);
    const period = occupancyPeriod(p);
    return placement && period ? [{ id: p.id, planting: p, placement, period }] : [];
  });
}

export const needsSeed = (p: PlantingListItem) => p.method !== 'vasarolt_palanta' && !p.is_history;

export function axisLabel(bed: BedGeometry): string {
  return bed.row_direction === 'keresztben' ? 'hossza' : 'szélessége';
}

export { bedAxes };

/** Üres ültetés-sablon (a szerkesztő élő ellenőrzéséhez épített „virtuális” ültetéshez). */
export function blankPlanting(): PlantingListItem {
  return {
    id: -1, year: 0, plant_id: 0, variety_id: null, seed_stock_id: null, bed_id: null,
    axis_start_cm: null, axis_span_cm: null, cross_start_cm: null, cross_span_cm: null, rows: null, plant_count: null,
    method: null, window_id: null,
    plan_sow_date: null, plan_transplant_date: null, plan_harvest_start: null, plan_end_date: null,
    actual_sow_date: null, actual_transplant_date: null, actual_harvest_start: null, actual_end_date: null,
    actual_bed_id: null, actual_axis_start_cm: null, actual_axis_span_cm: null, actual_cross_start_cm: null, actual_cross_span_cm: null,
    status: 'terv', is_history: false, series_id: null, series_index: null,
    eval_success: null, eval_yield: null, eval_recommend: null, eval_notes: null, notes: null,
    plant_name: '', variety_name: null, family_id: null, family_name: null,
    crop_group_id: null, crop_group_code: null, crop_group_name: null,
    rotation_stage: null, nutrient_group: null, perennial: false, frost_sensitive: false,
    in_row_spacing_cm: null, row_spacing_cm: null, days_to_harvest: null, harvest_duration_days: null, seed_viability_years: null,
    bed_name: null, bed_color: null, seed_vintage: null, has_seed: false, series_size: null,
  };
}
