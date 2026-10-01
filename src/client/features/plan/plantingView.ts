import { PLANTING_METHOD_LABEL, type PlantingStatus } from '@shared/labels.ts';
import { bedStart } from '@shared/domain/dates.ts';
import { effectiveBedId, effectiveDates, occupancyPeriod, placementOf } from '@shared/domain/plantings.ts';
import { bedAxes, estimatePlantCount, type BedGeometry, type Occupant } from '@shared/domain/geometry.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import type { Bed, PlantingListItem } from '@shared/types.ts';

export { effectiveBedId };
export { blankPlanting } from '@shared/domain/plantings.ts';

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
  if (d.harvestStart) {
    // Az azonos évre eső záró dátumnál az évet nem ismételjük
    const end = d.end ? (d.end.slice(0, 4) === d.harvestStart.slice(0, 4) ? shortDate(d.end) : f(d.end)) : null;
    parts.push(`szedés ${f(d.harvestStart)}${end ? `–${end}` : ' után'}`);
  }
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


/** A státuszcímke színe. */
export const STATUS_TONE: Record<PlantingStatus, 'neutral' | 'info' | 'good' | 'warn' | 'bad'> = {
  terv: 'neutral',
  folyamatban: 'info',
  lezart: 'good',
  elmaradt: 'warn',
  sikertelen: 'bad',
};
