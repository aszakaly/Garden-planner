import { completeDates, EMPTY_DATES, shiftDates, usesSow, usesTransplant, type FrostDates } from '@shared/domain/dates.ts';
import { bedAxes, rowsForSpan, spanForRows, type Placement } from '@shared/domain/geometry.ts';
import { pickWindowForDay, samePlacement, type ClashFix, type LayoutStrip } from '@shared/domain/layout.ts';
import { isConfirmed } from '@shared/domain/plantingChecks.ts';
import { blankPlanting, effectiveBedId, occupancyPeriod, placementOf, planDates } from '@shared/domain/plantings.ts';
import type { PlantingBatchInput } from '@shared/schemas.ts';
import type { Bed, PlantListItem, PlantingListItem } from '@shared/types.ts';
import { plantingInputOf } from '../plan/plantingView.ts';

/**
 * A kiosztás-szerkesztő piszkozata: az ágyásban álló ültetések (az újak negatív azonosítóval)
 * és a törlendők. Mentésig minden itt változik; a „Kész” a `toBatch` különbségét küldi.
 */
export interface LayoutDraft {
  items: PlantingListItem[];
  deleted: number[];
  /** A következő új ültetés azonosítója (negatív) */
  nextId: number;
}

export const draftFrom = (plantings: PlantingListItem[], bed: Pick<Bed, 'id'>): LayoutDraft => ({
  items: plantings.filter((p) => effectiveBedId(p) === bed.id),
  deleted: [],
  nextId: -1,
});

/**
 * Rögzített: más évhez tartozik (pl. ősszel ültetett fokhagyma), vagy már megtörtént (tény adat,
 * tényleges hely). A szerkesztő nem mozdítja és nem törli; ez csak a részletes lapon lehet.
 */
export const isFixed = (p: PlantingListItem, year: number) =>
  p.year !== year || p.actual_axis_start_cm != null || isConfirmed(p);

/** A napon az ágyásban álló, elhelyezett ültetések sávjai. */
export function stripsAt(draft: LayoutDraft, bed: Bed, year: number, day: string): LayoutStrip[] {
  return draft.items.flatMap((p) => {
    const period = occupancyPeriod(p);
    const placement = placementOf(p, bed);
    if (!period || !placement || !(period.start <= day && day < period.end)) return [];
    return [{ key: p.id, placement, fixed: isFixed(p, year) }];
  });
}

/** Az ültetés terv szerinti helye; teljes hosszú sávnál a keresztirányú mezők üresek, mint az ültetési lapon. */
export function placeItem(p: PlantingListItem, pl: Placement, bed: Bed): PlantingListItem {
  const { cross } = bedAxes(bed);
  const before = placementOf(p, bed);
  const full = Math.abs(pl.cross_start_cm) < 0.5 && Math.abs(pl.cross_span_cm - cross) < 0.5;
  const sameWidth = before != null && Math.abs(before.axis_span_cm - pl.axis_span_cm) < 0.5;
  return {
    ...p,
    axis_start_cm: pl.axis_start_cm,
    axis_span_cm: pl.axis_span_cm,
    cross_start_cm: full ? null : pl.cross_start_cm,
    cross_span_cm: full ? null : pl.cross_span_cm,
    rows: sameWidth && p.rows ? p.rows : rowsForSpan(pl.axis_span_cm, p.row_spacing_cm),
  };
}

/** A szerkesztett sávok visszaírása (a rögzítettek és a változatlanok érintetlenek). */
export function applyStrips(draft: LayoutDraft, strips: LayoutStrip[], bed: Bed): LayoutDraft {
  const byId = new Map(strips.map((s) => [s.key, s]));
  return {
    ...draft,
    items: draft.items.map((p) => {
      const s = byId.get(p.id);
      if (!s || s.fixed) return p;
      const before = placementOf(p, bed);
      return before && samePlacement(before, s.placement) ? p : placeItem(p, s.placement, bed);
    }),
  };
}

export interface NewPlantingContext {
  id: number;
  year: number;
  bedId: number;
  /** A pillanatkép napja: ehhez igazodik a vetési ablak */
  day: string;
  frost: FrostDates;
  cropGroupCode: string | null;
}

/** Új ültetés a növényből, egy sor szélességben; hely nélkül (azt a hívó adja `placeItem`-mel). */
export function plantingFor(plant: PlantListItem, ctx: NewPlantingContext): PlantingListItem {
  const crop = {
    daysToHarvest: plant.days_to_harvest,
    harvestDurationDays: plant.harvest_duration_days,
    frostSensitive: plant.frost_sensitive,
    perennial: plant.perennial,
  };
  const choice = pickWindowForDay(plant.windows, ctx.day, { year: ctx.year, crop, frost: ctx.frost });
  const method = choice?.method ?? 'helyrevetes';
  const dates = choice?.dates ?? completeDates({ ...EMPTY_DATES, sow: ctx.day }, method, crop, ctx.frost);
  return {
    ...blankPlanting(),
    id: ctx.id,
    year: ctx.year,
    bed_id: ctx.bedId,
    plant_id: plant.id,
    plant_name: plant.name_hu,
    family_id: plant.family_id,
    family_name: plant.family_name,
    crop_group_id: plant.crop_group_id,
    crop_group_code: ctx.cropGroupCode,
    crop_group_name: plant.crop_group_name,
    rotation_stage: plant.rotation_stage,
    nutrient_group: plant.nutrient_group,
    perennial: plant.perennial,
    frost_sensitive: plant.frost_sensitive,
    in_row_spacing_cm: plant.in_row_spacing_cm,
    row_spacing_cm: plant.row_spacing_cm,
    days_to_harvest: plant.days_to_harvest,
    harvest_duration_days: plant.harvest_duration_days,
    seed_viability_years: plant.seed_viability_years,
    method,
    window_id: choice?.window.id ?? null,
    plan_sow_date: usesSow(method) ? dates.sow : null,
    plan_transplant_date: usesTransplant(method) ? dates.transplant : null,
    plan_harvest_start: dates.harvestStart,
    plan_end_date: dates.end,
    rows: 1,
    axis_span_cm: spanForRows(1, plant.row_spacing_cm),
  };
}

/** Kapcsolt másolat: ugyanaz a növény, fajta, vetőmag, módszer és tervezett dátumok, tény adatok nélkül. */
export function copyPlanting(p: PlantingListItem, id: number): PlantingListItem {
  return {
    ...p,
    id,
    bed_id: effectiveBedId(p),
    status: 'terv',
    series_id: null,
    series_index: null,
    series_size: null,
    carried_from_id: null,
    plant_count: null,
    notes: null,
    actual_sow_date: null,
    actual_transplant_date: null,
    actual_harvest_start: null,
    actual_end_date: null,
    actual_bed_id: null,
    actual_axis_start_cm: null,
    actual_axis_span_cm: null,
    actual_cross_start_cm: null,
    actual_cross_span_cm: null,
    eval_success: null,
    eval_yield: null,
    eval_recommend: null,
    eval_notes: null,
  };
}

export const addItem = (draft: LayoutDraft, p: PlantingListItem): LayoutDraft => ({ ...draft, items: [...draft.items, p] });

export const removeItem = (draft: LayoutDraft, id: number): LayoutDraft => ({
  ...draft,
  items: draft.items.filter((p) => p.id !== id),
  deleted: id > 0 ? [...draft.deleted, id] : draft.deleted,
});

/** Ütközésjavítás alkalmazása a tervezett dátumokra. */
export function applyFix(draft: LayoutDraft, fix: ClashFix): LayoutDraft {
  return {
    ...draft,
    items: draft.items.map((p) => {
      if (p.id !== fix.plantingId) return p;
      if (fix.kind === 'elozo_vege') return { ...p, plan_end_date: fix.date };
      const d = shiftDates(planDates(p), fix.days);
      return { ...p, plan_sow_date: d.sow, plan_transplant_date: d.transplant, plan_harvest_start: d.harvestStart, plan_end_date: d.end };
    }),
  };
}

/** A mentendő különbség: új ültetések, megváltozott tervek, törlések. */
export function toBatch(original: PlantingListItem[], draft: LayoutDraft): PlantingBatchInput {
  const before = new Map(original.map((p) => [p.id, JSON.stringify(plantingInputOf(p))]));
  return {
    create: draft.items.filter((p) => p.id < 0).map(plantingInputOf),
    update: draft.items
      .filter((p) => p.id > 0 && before.get(p.id) !== JSON.stringify(plantingInputOf(p)))
      .map((p) => ({ id: p.id, data: plantingInputOf(p) })),
    delete: draft.deleted,
  };
}

export function isDirty(original: PlantingListItem[], draft: LayoutDraft): boolean {
  const b = toBatch(original, draft);
  return b.create.length + b.update.length + b.delete.length > 0;
}
