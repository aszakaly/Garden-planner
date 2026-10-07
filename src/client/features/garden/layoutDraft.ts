import { completeDates, EMPTY_DATES, usesSow, usesTransplant, type FrostDates } from '@shared/domain/dates.ts';
import { bedAxes, EPS, rowsForSpan, spanForRows, type Placement } from '@shared/domain/geometry.ts';
import {
  applyClashFix,
  isFullLength,
  pickWindowForDay,
  samePlacement,
  type ClashFix,
  type LayoutStrip,
} from '@shared/domain/layout.ts';
import { blankPlanting, effectiveBedId, occupancyPeriod, placementOf, startedOrRecorded } from '@shared/domain/plantings.ts';
import type { PlantingBatchInput } from '@shared/schemas.ts';
import type { Bed, PlantListItem, PlantingListItem } from '@shared/types.ts';
import { plantingInputOf } from '../plan/plantingView.ts';

/**
 * A sorszám alapja: a sáv szélessége és sorszáma (üres is lehet), amikor a piszkozatba került.
 * Ha a sorszám eltér a sortáv szerintitől, a sorköze (szélesség / sorszám) a saját sűrűség: így
 * a tankönyvinél sűrűbb vagy ritkább sorok is megmaradnak.
 */
export interface RowBase {
  span: number;
  rows: number | null;
}

/**
 * A kiosztás-szerkesztő piszkozata: az ágyásban álló ültetések (az újak negatív azonosítóval)
 * és a törlendők. Mentésig minden itt változik; a „Kész” a `toBatch` különbségét küldi.
 */
export interface LayoutDraft {
  items: PlantingListItem[];
  deleted: number[];
  /** A következő új ültetés azonosítója (negatív) */
  nextId: number;
  /**
   * Ültetésenként a sorszám alapja (lásd `placeItem`); szélesség nélküli ültetésnél nincs, ekkor a
   * sortáv számít. Felvételkor és cserekor áll be, a húzás nem változtatja; a mentéshez nem tartozik.
   */
  rowBase: Record<number, RowBase>;
}

const withoutKey = <T>(rec: Record<number, T>, id: number): Record<number, T> => {
  const next = { ...rec };
  delete next[id];
  return next;
};

/** Az ültetés saját szélessége és sorszáma lesz az alapja (szélesség nélkül nincs alapja). */
function withRowBase(base: Record<number, RowBase>, p: PlantingListItem): Record<number, RowBase> {
  const rest = withoutKey(base, p.id);
  return p.axis_span_cm != null && p.axis_span_cm > 0 ? { ...rest, [p.id]: { span: p.axis_span_cm, rows: p.rows } } : rest;
}

/** Az ágyás piszkozata; az első új ültetés azonosítója -1. */
export function draftFrom(plantings: PlantingListItem[], bed: Pick<Bed, 'id'>): LayoutDraft {
  const items = plantings.filter((p) => effectiveBedId(p) === bed.id);
  return { items, deleted: [], nextId: -1, rowBase: items.reduce<Record<number, RowBase>>(withRowBase, {}) };
}

/**
 * Rögzített: más évhez tartozik (pl. ősszel ültetett fokhagyma), vagy megkezdett, illetve rögzített
 * (`startedOrRecorded`, ugyanaz, amit a szerver a törlésnél ellenőriz): előzmény, nem tervezett
 * státusz, tény dátum, tényleges hely, vagy máshol valósult meg (tényleges ágyás, akár hely nélkül:
 * ekkor a terv szerinti, másik ágyásbeli koordinátáival látszik). A szerkesztő nem mozdítja és nem
 * törli; ez csak a részletes lapon lehet.
 */
export const isFixed = (p: PlantingListItem, year: number) => p.year !== year || startedOrRecorded(p);

/** A napon az ágyásban álló, elhelyezett ültetések sávjai. */
export function stripsAt(draft: LayoutDraft, bed: Bed, year: number, day: string): LayoutStrip[] {
  return draft.items.flatMap((p) => {
    const period = occupancyPeriod(p);
    const placement = placementOf(p, bed);
    if (!period || !placement || !(period.start <= day && day < period.end)) return [];
    return [{ key: p.id, placement, fixed: isFixed(p, year) }];
  });
}

const sameSpan = (a: number, b: number) => Math.abs(a - b) < EPS;

/**
 * Az ültetés terv szerinti helye; teljes hosszú sávnál a keresztirányú mezők üresek, mint az
 * ültetési lapon. A sorszám:
 * - változatlan szélességnél (tisztán mozgatás vagy keresztirányú változás) marad, üresen is;
 * - az alap (`base`) szélességén az alap sorszáma, üresen is;
 * - egyébként, ha az alap sorszáma eltér a sortáv szerintitől, a saját sorközével a legközelebbi
 *   egész sorszám (legalább 1), hogy mentés és újratöltés után se kopjon a sűrűség; különben (a
 *   sortáv szerinti vagy üres sorszámnál, alap nélkül) annyi sor, amennyi a sortávval elfér.
 * A sorszám így csak a szélességtől és az alaptól függ, attól nem, milyen lépésekben jutott ide
 * a húzás; a kiinduló szélességre visszahúzva a kiinduló sorszám áll vissza.
 */
function placeItem(p: PlantingListItem, pl: Placement, bed: Bed, base: RowBase | undefined): PlantingListItem {
  const full = isFullLength(pl, bedAxes(bed).cross);
  return {
    ...p,
    axis_start_cm: pl.axis_start_cm,
    axis_span_cm: pl.axis_span_cm,
    cross_start_cm: full ? null : pl.cross_start_cm,
    cross_span_cm: full ? null : pl.cross_span_cm,
    rows: rowsAt(p, pl.axis_span_cm, base),
  };
}

function rowsAt(p: PlantingListItem, span: number, base: RowBase | undefined): number | null {
  if (p.axis_span_cm != null && sameSpan(span, p.axis_span_cm)) return p.rows;
  if (base && sameSpan(span, base.span)) return base.rows;
  // a sortáv szerinti sorszám (a kerekítési maradékkal, egy sorral is) nem saját sűrűség
  if (base?.rows && rowsForSpan(base.span, p.row_spacing_cm) !== base.rows) {
    // span / (base.span / base.rows), osztás nélkül a sorközzel, hogy a feles értékek pontosak legyenek
    return Math.max(1, Math.round((span * base.rows) / base.span));
  }
  return rowsForSpan(span, p.row_spacing_cm);
}

/**
 * A szerkesztett sávok visszaírása; a rögzítettek, a változatlanok és a `strips`-ben nem
 * szereplők érintetlenek. A sorszám a piszkozatbeli alaphoz (`rowBase`) igazodik.
 */
export function applyStrips(draft: LayoutDraft, strips: LayoutStrip[], bed: Bed): LayoutDraft {
  const byId = new Map(strips.map((s) => [s.key, s]));
  return {
    ...draft,
    items: draft.items.map((p) => {
      const s = byId.get(p.id);
      if (!s || s.fixed) return p;
      const before = placementOf(p, bed);
      return before && samePlacement(before, s.placement) ? p : placeItem(p, s.placement, bed, draft.rowBase[p.id]);
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

/**
 * Új ültetés a növényből, egy sor szélességben, hely nélkül; a hívó helyezi el:
 * `applyStrips(addItem(d, p), [{ key: p.id, placement }], bed)`.
 */
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
    is_history: false,
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

/**
 * Felvétel a piszkozatba, a felvett ültetés saját szélességével és sorszámával mint alappal (így a
 * másolat és a megosztott sáv fele a forrás sűrűségét viszi tovább). Új (negatív azonosítójú)
 * ültetésnél a következő azonosító is lép.
 */
export const addItem = (draft: LayoutDraft, p: PlantingListItem): LayoutDraft => ({
  ...draft,
  items: [...draft.items, p],
  nextId: p.id < 0 ? Math.min(draft.nextId, p.id - 1) : draft.nextId,
  rowBase: withRowBase(draft.rowBase, p),
});

/**
 * Csere az azonos azonosítójú ültetésre (pl. másik növény az új sávban); az alap is az új
 * ültetésé lesz. A piszkozatban nem szereplő azonosítónál nem változik semmi.
 */
export function replaceItem(draft: LayoutDraft, p: PlantingListItem): LayoutDraft {
  if (!draft.items.some((x) => x.id === p.id)) return draft;
  return {
    ...draft,
    items: draft.items.map((x) => (x.id === p.id ? p : x)),
    rowBase: withRowBase(draft.rowBase, p),
  };
}

/** Eltávolítás; csak a piszkozatban lévő mentett ültetés kerül (egyszer) a törlendők közé. */
export function removeItem(draft: LayoutDraft, id: number): LayoutDraft {
  const present = draft.items.some((p) => p.id === id);
  return {
    ...draft,
    items: draft.items.filter((p) => p.id !== id),
    deleted: id > 0 && present && !draft.deleted.includes(id) ? [...draft.deleted, id] : draft.deleted,
    rowBase: withoutKey(draft.rowBase, id),
  };
}

/** Ütközésjavítás alkalmazása a tervezett dátumokra. */
export function applyFix(draft: LayoutDraft, fix: ClashFix): LayoutDraft {
  return {
    ...draft,
    items: draft.items.map((p) => (p.id === fix.plantingId ? applyClashFix(p, fix) : p)),
  };
}

/** A mentendő különbség: új ültetések, megváltozott tervek, törlések (a sorszám alapja nem számít). */
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
