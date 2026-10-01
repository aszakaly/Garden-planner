import type { CheckLevel, PlantingMethod, WindowMethod } from '../labels.ts';
import type { GrowingWindow } from '../types.ts';
import { withArticle } from '../text.ts';
import { addDaysISO, diffDays, isoFromMonthDay, maxISO, monthDayInRange, monthDayOf, shortDate } from './isoDate.ts';

/**
 * Egy ültetés tervezett dátumai. A vetés palántánál a tálcás vetés napja,
 * vásárolt palántánál nincs. A terület a kiültetéstől (palánta) vagy a vetéstől foglalt.
 */
export interface PlantingDates {
  sow: string | null;
  transplant: string | null;
  harvestStart: string | null;
  /** A terület felszabadul (a betakarítás vége) */
  end: string | null;
}

/** A dátumok időrendje – egy korábbi dátum módosítása a későbbieket is elcsúsztatja. */
export const DATE_FIELDS = ['sow', 'transplant', 'harvestStart', 'end'] as const;
export type DateField = (typeof DATE_FIELDS)[number];

export const EMPTY_DATES: PlantingDates = { sow: null, transplant: null, harvestStart: null, end: null };

export interface CropTiming {
  daysToHarvest: number | null;
  harvestDurationDays: number | null;
  frostSensitive: boolean;
  perennial: boolean;
}

export interface FrostDates {
  /** Utolsó tavaszi fagy (HH-NN) */
  lastFrost: string;
  /** Első őszi fagy (HH-NN) */
  firstFrost: string;
}

/** Ha a betakarítás hossza nem ismert, ennyi nappal számolunk. */
export const DEFAULT_HARVEST_DAYS = 30;

export const usesTransplant = (m: PlantingMethod | null | undefined) => m === 'palanta' || m === 'vasarolt_palanta';
export const usesSow = (m: PlantingMethod | null | undefined) => m !== 'vasarolt_palanta';

/** Milyen ültetési módok illenek egy időszakhoz. */
export function methodsForWindow(m: WindowMethod): PlantingMethod[] {
  if (m === 'palanta') return ['palanta', 'vasarolt_palanta'];
  return [m];
}

/** Az a nap, amikor a növény az ágyásba kerül. */
export function bedStart(method: PlantingMethod | null | undefined, d: PlantingDates): string | null {
  return usesTransplant(method) ? d.transplant : d.sow;
}

export function shiftDates(d: PlantingDates, days: number): PlantingDates {
  const shift = (v: string | null) => (v ? addDaysISO(v, days) : null);
  return { sow: shift(d.sow), transplant: shift(d.transplant), harvestStart: shift(d.harvestStart), end: shift(d.end) };
}

/**
 * Egy dátum módosítása: a későbbi (már kitöltött) dátumok ugyanannyival csúsznak,
 * így a nevelési és tenyészidő megmarad.
 */
export function setDateShifting(d: PlantingDates, field: DateField, value: string | null): PlantingDates {
  const old = d[field];
  const next = { ...d, [field]: value };
  if (!old || !value) return next;
  const delta = diffDays(old, value);
  for (const later of DATE_FIELDS.slice(DATE_FIELDS.indexOf(field) + 1)) {
    const v = d[later];
    if (v) next[later] = addDaysISO(v, delta);
  }
  return next;
}

/**
 * Betakarítás és a terület felszabadulása az ágyásba kerülés napjából:
 * a tenyészidő (vagy az időszak betakarítási kezdete, ha az későbbi), majd a betakarítás hossza.
 * Fagyérzékeny növény legkésőbb az első őszi fagyig marad.
 */
export function harvestFromStart(
  start: string,
  crop: CropTiming,
  frost: FrostDates,
  window?: Pick<GrowingWindow, 'harvest_start' | 'harvest_year_offset'> | null,
  year = Number(start.slice(0, 4)),
): Pick<PlantingDates, 'harvestStart' | 'end'> {
  const candidates: string[] = [];
  if (crop.daysToHarvest) candidates.push(addDaysISO(start, crop.daysToHarvest));
  if (window?.harvest_start) {
    const byWindow = isoFromMonthDay(year + window.harvest_year_offset, window.harvest_start);
    if (byWindow > start) candidates.push(byWindow);
  }
  if (!candidates.length) return { harvestStart: null, end: null };
  const harvestStart = candidates.reduce(maxISO);
  if (crop.perennial) return { harvestStart, end: null };

  let end = addDaysISO(harvestStart, crop.harvestDurationDays ?? DEFAULT_HARVEST_DAYS);
  if (crop.frostSensitive) {
    const firstFrost = isoFromMonthDay(Number(harvestStart.slice(0, 4)), frost.firstFrost);
    if (end > firstFrost) end = maxISO(firstFrost, harvestStart);
  }
  return { harvestStart, end };
}

export interface SuggestInput {
  year: number;
  window: GrowingWindow;
  method: PlantingMethod;
  crop: CropTiming;
  frost: FrostDates;
}

/**
 * Javasolt dátumok egy termesztési időszakból: az időszak elejéről indul, fagyérzékeny
 * növénynél legkorábban az utolsó tavaszi fagy napjától; palántánál a vetés a kiültetésből
 * visszaszámolva (nevelési hetek).
 */
export function suggestDates({ year, window: w, method, crop, frost }: SuggestInput): PlantingDates {
  const iso = (md: string) => isoFromMonthDay(year, md);
  const afterFrost = (d: string) => (crop.frostSensitive ? maxISO(d, iso(frost.lastFrost)) : d);
  let sow: string | null = null;
  let transplant: string | null = null;

  if (usesTransplant(method)) {
    const fromSow = w.sow_start && w.seedling_weeks ? addDaysISO(iso(w.sow_start), w.seedling_weeks * 7) : null;
    const t = w.transplant_start ? iso(w.transplant_start) : fromSow;
    transplant = t ? afterFrost(t) : null;
    if (method === 'palanta') {
      sow =
        transplant && w.seedling_weeks
          ? addDaysISO(transplant, -w.seedling_weeks * 7)
          : w.sow_start
            ? iso(w.sow_start)
            : null;
    }
  } else if (w.sow_start) {
    sow = afterFrost(iso(w.sow_start));
  }

  const start = bedStart(method, { sow, transplant, harvestStart: null, end: null });
  const harvest = start ? harvestFromStart(start, crop, frost, w, year) : { harvestStart: null, end: null };
  return { sow, transplant, ...harvest };
}

/** Az üres betakarítási dátumok kitöltése a meglévő kezdődátumból (egyéni időszaknál). */
export function completeDates(
  d: PlantingDates,
  method: PlantingMethod,
  crop: CropTiming,
  frost: FrostDates,
): PlantingDates {
  const start = bedStart(method, d);
  if (!start || (d.harvestStart && d.end)) return d;
  const h = harvestFromStart(start, crop, frost);
  return { ...d, harvestStart: d.harvestStart ?? h.harvestStart, end: d.end ?? h.end };
}

/** Újravetés-sorozat: az egyes vetések eltolása napokban (0, köz, 2×köz, …). */
export function seriesOffsets(count: number, intervalDays: number): number[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => i * intervalDays);
}

/**
 * Hány vetés fér bele a vetési időszak végéig az első vetéstől (legalább 1, legfeljebb 12).
 */
export function suggestedSeriesCount(w: GrowingWindow, firstSow: string, intervalDays: number): number {
  const endMd = w.sow_end ?? w.transplant_end;
  if (!endMd || intervalDays <= 0) return 1;
  const year = Number(firstSow.slice(0, 4));
  let last = isoFromMonthDay(year, endMd);
  if (last < firstSow) last = isoFromMonthDay(year + 1, endMd);
  return Math.min(12, Math.max(1, Math.floor(diffDays(firstSow, last) / intervalDays) + 1));
}

// --- Ellenőrzés ---------------------------------------------------------------

export interface DateIssue {
  level: CheckLevel;
  /** sorrend: fordított dátumok · fagy / oszi_fagy: fagyveszély · idoszak: a javasolt időszakon kívül */
  code: 'sorrend' | 'fagy' | 'oszi_fagy' | 'idoszak';
  field: DateField;
  message: string;
}

export interface CheckDatesInput {
  dates: PlantingDates;
  method: PlantingMethod;
  window?: GrowingWindow | null;
  crop: CropTiming;
  frost: FrostDates;
}

const FIELD_NAME: Record<DateField, string> = {
  sow: 'vetés',
  transplant: 'kiültetés',
  harvestStart: 'betakarítás kezdete',
  end: 'terület felszabadulása',
};

/** A dátumok ellentmondásai, fagyveszély és a javasolt időszakon kívüli időpontok. */
export function checkDates({ dates, method, window: w, crop, frost }: CheckDatesInput): DateIssue[] {
  const issues: DateIssue[] = [];
  const start = bedStart(method, dates);
  const startField: DateField = usesTransplant(method) ? 'transplant' : 'sow';
  const startName = usesTransplant(method) ? 'kiültetés' : method === 'ultetes' ? 'ültetés' : 'vetés';

  // Időrend
  const order = DATE_FIELDS.filter((f) => dates[f] && (f !== 'sow' || usesSow(method)));
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1]!;
    const b = order[i]!;
    if (dates[b]! < dates[a]!) {
      issues.push({
        level: 'kerulendo',
        code: 'sorrend',
        field: b,
        message: `${withArticle(FIELD_NAME[b], true)} (${shortDate(dates[b]!)}) korábbra esik, mint ${withArticle(FIELD_NAME[a])} (${shortDate(dates[a]!)}).`,
      });
    }
  }

  // Fagy
  if (crop.frostSensitive && start) {
    const lastFrost = isoFromMonthDay(Number(start.slice(0, 4)), frost.lastFrost);
    const firstFrost = isoFromMonthDay(Number(start.slice(0, 4)), frost.firstFrost);
    if (start < lastFrost) {
      issues.push({
        level: 'figyelem',
        code: 'fagy',
        field: startField,
        message: `Fagyérzékeny növény: ${withArticle(startName)} (${shortDate(start)}) az utolsó tavaszi fagy (${shortDate(lastFrost)}) előtt van – készülj takarással.`,
      });
    }
    if (dates.harvestStart && dates.harvestStart >= firstFrost) {
      issues.push({
        level: 'figyelem',
        code: 'oszi_fagy',
        field: 'harvestStart',
        message: `A betakarítás az első őszi fagy (${shortDate(firstFrost)}) utánra esik – fagyérzékeny növénynél ez már késő.`,
      });
    } else if (dates.end && dates.end > firstFrost && !crop.perennial) {
      issues.push({
        level: 'info',
        code: 'oszi_fagy',
        field: 'end',
        message: `A fagyérzékeny kultúra várhatóan csak az első őszi fagyig (${shortDate(firstFrost)}) marad meg.`,
      });
    }
  }

  // Javasolt időszak
  if (w) {
    if (dates.sow && usesSow(method) && w.sow_start && w.sow_end && !monthDayInRange(monthDayOf(dates.sow), w.sow_start, w.sow_end)) {
      issues.push({
        level: 'info',
        code: 'idoszak',
        field: 'sow',
        message: `${withArticle(method === 'ultetes' ? 'ültetés' : 'vetés', true)} a javasolt időszakon (${shortDate(w.sow_start)} – ${shortDate(w.sow_end)}) kívül esik.`,
      });
    }
    if (
      dates.transplant &&
      usesTransplant(method) &&
      w.transplant_start &&
      w.transplant_end &&
      !monthDayInRange(monthDayOf(dates.transplant), w.transplant_start, w.transplant_end)
    ) {
      issues.push({
        level: 'info',
        code: 'idoszak',
        field: 'transplant',
        message: `A kiültetés a javasolt időszakon (${shortDate(w.transplant_start)} – ${shortDate(w.transplant_end)}) kívül esik.`,
      });
    }
  }
  return issues;
}
