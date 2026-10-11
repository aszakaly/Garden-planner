import { SEASON_LABEL, type PlantingMethod, type WindowMethod } from '@shared/labels.ts';
import {
  completeDates,
  methodsForWindow,
  setDateShifting,
  suggestDates,
  suggestedSeriesCount,
  usesSow,
  usesTransplant,
  type CropTiming,
  type DateField,
  type FrostDates,
  type PlantingDates,
} from '@shared/domain/dates.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import { occupancyPeriod } from '@shared/domain/plantings.ts';
import type { GrowingWindow, PlantListItem, PlantingListItem, SeedStockListItem, Variety, VarietyWithWindows } from '@shared/types.ts';
import { todayISO } from '../../lib/format.ts';

/**
 * Az ültetés tervezési adatainak közös űrlaplogikája: az ültetési lap és a munkalap sáv-panelje
 * ugyanígy választ időszakot, módszert és fajtát, és ugyanígy számolja újra a dátumokat.
 */
export interface PlanFields {
  year: number;
  plant_id: number | null;
  variety_id: number | null;
  seed_stock_id: number | null;
  window_id: number | null;
  method: PlantingMethod;
  dates: PlantingDates;
}

/** A fajtaválasztó „＋ Új fajta…” eleme */
export const NEW_VARIETY = -1;

const METHOD_SHORT: Record<WindowMethod, string> = { helyrevetes: 'helyrevetés', palanta: 'palántáról', ultetes: 'ültetés' };

export function windowLabel(w: GrowingWindow, varietyName?: string): string {
  const range =
    w.method === 'palanta' && w.transplant_start && w.transplant_end
      ? `kiültetés ${shortDate(w.transplant_start)} – ${shortDate(w.transplant_end)}`
      : w.sow_start && w.sow_end
        ? `${w.method === 'ultetes' ? 'ültetés' : 'vetés'} ${shortDate(w.sow_start)} – ${shortDate(w.sow_end)}`
        : '';
  return `${varietyName ? `${varietyName}: ` : ''}${SEASON_LABEL[w.season]} · ${METHOD_SHORT[w.method]}${range ? ` (${range})` : ''}`;
}

/** A választható időszakok: előbb a fajta saját időszakai, aztán a növényéi. */
export function windowOptions(plant: PlantListItem | undefined, variety: VarietyWithWindows | null): { w: GrowingWindow; label: string }[] {
  return [
    ...(variety?.windows ?? []).map((w) => ({ w, label: windowLabel(w, variety!.name) })),
    ...(plant?.windows ?? []).map((w) => ({ w, label: windowLabel(w) })),
  ];
}

/** Az idei évben az első még elérhető időszak, egyébként az első. */
export function defaultWindow(windows: GrowingWindow[], year: number, today = todayISO()): GrowingWindow | null {
  if (!windows.length) return null;
  if (!today.startsWith(`${year}-`)) return windows[0]!;
  const md = today.slice(5);
  const lastDay = (w: GrowingWindow) => (w.method === 'palanta' ? w.transplant_end : w.sow_end);
  return windows.find((w) => (lastDay(w) ?? '') >= md) ?? windows[0]!;
}

/** Az alapértelmezett sorszám: kb. 60 cm-nyi sor a sortávval (legalább 1). */
export const defaultRows = (rowSpacing: number | null) => (rowSpacing ? Math.max(1, Math.round(60 / rowSpacing)) : 1);

export function cropOf(plant: PlantListItem, variety?: Variety | null): CropTiming {
  return {
    daysToHarvest: variety?.days_to_harvest ?? plant.days_to_harvest,
    harvestDurationDays: plant.harvest_duration_days,
    frostSensitive: plant.frost_sensitive,
    perennial: plant.perennial,
  };
}

/** Időszak választása: a módszer (ha az időszakhoz nem illik) és a dátumok az időszakból. */
export function withWindow<F extends PlanFields>(f: F, w: GrowingWindow | null, crop: CropTiming, frost: FrostDates): F {
  if (!w) return { ...f, window_id: null };
  const methods = methodsForWindow(w.method);
  const method = methods.includes(f.method) ? f.method : methods[0]!;
  return { ...f, window_id: w.id, method, dates: suggestDates({ year: f.year, window: w, method, crop, frost }) };
}

/** Módszer választása: időszaknál a dátumok is újraszámolódnak. */
export function withMethod<F extends PlanFields>(
  f: F,
  m: PlantingMethod,
  w: GrowingWindow | null,
  crop: CropTiming | null,
  frost: FrostDates,
): F {
  if (w && crop) return { ...f, method: m, dates: suggestDates({ year: f.year, window: w, method: m, crop, frost }) };
  return { ...f, method: m };
}

/** Egy dátum módosítása: a későbbiek ugyanannyival tolódnak; a kezdőnapból a hiányzók is kitöltődnek. */
export function withDate<F extends PlanFields>(
  f: F,
  field: DateField,
  value: string | null,
  crop: CropTiming | null,
  frost: FrostDates,
): F {
  let dates = setDateShifting(f.dates, field, value);
  const startField: DateField = usesTransplant(f.method) ? 'transplant' : 'sow';
  if (field === startField && crop) dates = completeDates(dates, f.method, crop, frost);
  return { ...f, dates };
}

/** A javasolt dátumok visszaállítása az időszakból. */
export function withSuggestedDates<F extends PlanFields>(f: F, w: GrowingWindow | null, crop: CropTiming | null, frost: FrostDates): F {
  return w && crop ? { ...f, dates: suggestDates({ year: f.year, window: w, method: f.method, crop, frost }) } : f;
}

/** A fajta legfrissebb készleten lévő vetőmagtétele. */
export function newestStock(seeds: SeedStockListItem[], varietyId: number | null): SeedStockListItem | undefined {
  if (varietyId == null) return undefined;
  return seeds.filter((x) => x.variety_id === varietyId && x.in_stock).sort((a, b) => (b.vintage_year ?? 0) - (a.vintage_year ?? 0))[0];
}

/** Van-e készleten vetőmag: a fajtából, fajta nélkül a növény bármely fajtájából. */
export function hasSeedInStock(seeds: SeedStockListItem[], plantId: number | null, varietyId: number | null): boolean {
  return varietyId && varietyId !== NEW_VARIETY
    ? seeds.some((x) => x.variety_id === varietyId && x.in_stock)
    : seeds.some((x) => x.plant_id === plantId && x.in_stock);
}

/** Az újravetés alapértékei az időszakból: az időköz és az, hány vetés fér bele az időszak végéig. */
export function seriesDefaults(
  w: GrowingWindow | null,
  dates: PlantingDates,
  fallback: { count: number; interval: number },
): { count: number; interval: number } {
  const interval = w?.succession_days ?? fallback.interval;
  const first = dates.sow ?? dates.transplant;
  const count = w && first && w.succession_days ? Math.max(2, suggestedSeriesCount(w, first, interval)) : fallback.count;
  return { count, interval };
}

/** Az űrlap dátumai egy ültetés-szerű objektumként (a foglaltság számításához). */
export function periodOfPlan(f: PlanFields, perennial = false, carriedFrom: number | null = null) {
  return occupancyPeriod({
    year: f.year,
    method: f.method,
    status: 'terv',
    perennial,
    carried_from_id: carriedFrom,
    plan_sow_date: usesSow(f.method) ? f.dates.sow : null,
    plan_transplant_date: usesTransplant(f.method) ? f.dates.transplant : null,
    plan_harvest_start: f.dates.harvestStart,
    plan_end_date: f.dates.end,
    actual_sow_date: null,
    actual_transplant_date: null,
    actual_harvest_start: null,
    actual_end_date: null,
  });
}

/** A vetés dátumának felirata a módszer szerint. */
export const sowLabel = (m: PlantingMethod) => (m === 'palanta' ? 'Vetés (palántának)' : m === 'ultetes' ? 'Ültetés' : 'Vetés');

/** Az ültetés tervezési adatai űrlapként (a munkalap panelje így szerkeszti). */
export function planOf(p: PlantingListItem): PlanFields {
  return {
    year: p.year,
    plant_id: p.plant_id,
    variety_id: p.variety_id,
    seed_stock_id: p.seed_stock_id,
    window_id: p.window_id,
    method: p.method ?? 'helyrevetes',
    dates: { sow: p.plan_sow_date, transplant: p.plan_transplant_date, harvestStart: p.plan_harvest_start, end: p.plan_end_date },
  };
}

/**
 * Az űrlap visszaírása az ültetésre, a megjelenítéshez és az ellenőrzésekhez tartozó mezőkkel
 * együtt (fajtanév, a fajta sor- és tőtávja, vetőmag-évjárat, van-e vetőmag). A növény nem változik.
 */
export function withPlan(
  p: PlantingListItem,
  f: PlanFields,
  ctx: { plant: PlantListItem | undefined; variety: Variety | null; seeds: SeedStockListItem[] },
): PlantingListItem {
  const { plant, variety, seeds } = ctx;
  const seed = usesSow(f.method) ? f.seed_stock_id : null;
  const stock = seed != null ? seeds.find((x) => x.id === seed) : undefined;
  return {
    ...p,
    variety_id: f.variety_id,
    variety_name: f.variety_id == null ? null : (variety?.name ?? p.variety_name),
    seed_stock_id: seed,
    seed_vintage: stock?.vintage_year ?? null,
    has_seed: hasSeedInStock(seeds, p.plant_id, f.variety_id),
    window_id: f.window_id,
    method: f.method,
    plan_sow_date: usesSow(f.method) ? f.dates.sow : null,
    plan_transplant_date: usesTransplant(f.method) ? f.dates.transplant : null,
    plan_harvest_start: f.dates.harvestStart,
    plan_end_date: f.dates.end,
    row_spacing_cm: variety?.row_spacing_cm ?? plant?.row_spacing_cm ?? p.row_spacing_cm,
    in_row_spacing_cm: variety?.in_row_spacing_cm ?? plant?.in_row_spacing_cm ?? p.in_row_spacing_cm,
    days_to_harvest: variety?.days_to_harvest ?? plant?.days_to_harvest ?? p.days_to_harvest,
  };
}
