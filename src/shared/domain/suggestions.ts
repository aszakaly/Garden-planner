import { ROTATION_STAGE_NOUN, type CheckLevel, type PlantingMethod } from '../labels.ts';
import type { Bed, GrowingWindow, PlantListItem, PlantingListItem, SeedStockListItem } from '../types.ts';
import { bedRotationSummary, rotationIssues, type RotationCode } from './rotation.ts';
import { companionChecks, rotationHistory, toRotationCrop, type ChecksContext } from './plantingChecks.ts';
import {
  bedStart,
  harvestFromStart,
  methodsForWindow,
  suggestDates,
  usesTransplant,
  type CropTiming,
  type PlantingDates,
} from './dates.ts';
import { bedAxes, freeAxisRanges, rowsForSpan, spanForRows, type Occupant, type Period, type Placement } from './geometry.ts';
import { addDaysISO, diffDays, isoFromMonthDay, maxISO, shortDate } from './isoDate.ts';
import { blankPlanting, effectiveBedId, occupancyPeriod, placementOf } from './plantings.ts';
import { seedViability } from './seeds.ts';

/**
 * „Mi kerülhet ide?” – egy ágyásrészhez és időszakhoz rangsorolt növényjavaslatok
 * a meglévő ellenőrzések alapján: belefér-e az időszakba és a sávba, rendben van-e
 * a vetésforgó, jók-e a szomszédok, van-e vetőmag, és hogyan vált be korábban.
 */

export interface SuggestionTarget {
  bed: Bed;
  year: number;
  /** A vizsgált sáv a tengely mentén; null: a teljes ágyásban keres, alapértelmezett szélességgel */
  strip: { start: number; span: number } | null;
  /** Keresztirányú rész; null: teljes szélességben */
  cross: { start: number; span: number } | null;
  /** Legkorábban ekkor kerülhet az ágyásba */
  from: string;
  /** Ma (a múltbeli vetést nem javasoljuk) */
  today: string;
  /** A szerkesztett ültetés (nem számít foglaltságnak) */
  excludeId?: number;
}

export interface SuggestionInput {
  target: SuggestionTarget;
  plants: PlantListItem[];
  seeds: SeedStockListItem[];
  ctx: ChecksContext;
}

export interface SuggestionReason {
  level: CheckLevel | 'ok';
  text: string;
  /** Hosszabb magyarázat (pl. a vetésforgó-ellenőrzés teljes üzenete) */
  detail?: string;
}

export type SuggestionRank = 'ajanlott' | 'lehetseges' | 'kerulendo';
export const SUGGESTION_RANKS: SuggestionRank[] = ['ajanlott', 'lehetseges', 'kerulendo'];
export const SUGGESTION_RANK_LABEL: Record<SuggestionRank, string> = {
  ajanlott: 'Ajánlott',
  lehetseges: 'Lehetséges',
  kerulendo: 'Kerülendő',
};

export interface Suggestion {
  plant: PlantListItem;
  window: GrowingWindow;
  method: PlantingMethod;
  dates: PlantingDates;
  period: Period;
  placement: Placement;
  rows: number;
  variety_id: number | null;
  variety_name: string | null;
  seed_stock_id: number | null;
  score: number;
  rank: SuggestionRank;
  reasons: SuggestionReason[];
}

const ROTATION_SHORT: Record<RotationCode, string> = {
  ugyanaz: 'Tavaly is itt volt',
  csalad: 'Családi szünet',
  tapanyag: 'Erős tápanyagigény egymás után',
  szakasz: 'Ugyanaz a vetésforgó-szakasz',
  szakasz_kimarad: 'Nem a soron következő szakasz',
  utovetemeny: 'Azonos család előtte',
};
const LEVEL_SCORE: Record<CheckLevel, number> = { kerulendo: -100, figyelem: -35, info: -5 };

const lower = (s: string) => s.toLocaleLowerCase('hu');
const defaultRows = (rowSpacing: number) => Math.max(1, Math.round(60 / rowSpacing));

function cropOf(plant: PlantListItem): CropTiming {
  return {
    daysToHarvest: plant.days_to_harvest,
    harvestDurationDays: plant.harvest_duration_days,
    frostSensitive: plant.frost_sensitive,
    perennial: plant.perennial,
  };
}

/** Az ágyás elhelyezett ültetései foglaltságként (a szerkesztett kivételével). */
function occupantsOf(target: SuggestionTarget, all: PlantingListItem[]): Occupant[] {
  return all.flatMap((p) => {
    if (p.id === target.excludeId || effectiveBedId(p) !== target.bed.id) return [];
    const placement = placementOf(p, target.bed);
    const period = occupancyPeriod(p);
    return placement && period ? [{ id: p.id, placement, period }] : [];
  });
}

interface Fit {
  method: PlantingMethod;
  dates: PlantingDates;
  period: Period;
  placement: Placement;
  rows: number;
  /** Később kezdődik, mint ahogy az időszak engedné, mert addig foglalt a hely */
  waited: boolean;
}

/**
 * A legkorábbi kezdés az időszakon belül, amikor a sávban elfér: az időszak eleje
 * (vagy a megadott legkorábbi nap), illetve a sávban álló ültetések felszabadulásának napjai.
 */
function findFit(plant: PlantListItem, w: GrowingWindow, target: SuggestionTarget, occupants: Occupant[], ctx: ChecksContext): Fit | null {
  const { year, bed } = target;
  const crop = cropOf(plant);
  const rowSpacing = plant.row_spacing_cm || 30;
  const { axis, cross: crossLen } = bedAxes(bed);
  const strip = target.strip ?? { start: 0, span: axis };
  const cross = target.cross ?? { start: 0, span: crossLen };
  const minSpan = spanForRows(1, rowSpacing);
  if (minSpan > strip.span + 0.5) return null;

  for (const preferred of methodsForWindow(w.method)) {
    const base = suggestDates({ year, window: w, method: preferred, crop, frost: ctx.frost });
    const s0 = bedStart(preferred, base);
    if (!s0) continue;
    const endMd = usesTransplant(preferred) ? w.transplant_end : w.sow_end;
    const lastStart = endMd ? isoFromMonthDay(year, endMd) : s0;
    const first = maxISO(s0, target.from);
    const starts = [first, ...occupants.map((o) => o.period.end).filter((d) => d > first && d <= lastStart)].sort();

    for (const start of [...new Set(starts)]) {
      if (start > lastStart) break;
      const delta = diffDays(s0, start);
      const shift = (d: string | null) => (d ? addDaysISO(d, delta) : null);
      let method = preferred;
      let sow = shift(base.sow);
      // Saját palántát már nem lehet nevelni, ha a vetés napja elmúlt: marad a vásárolt palánta
      if (method === 'palanta' && sow && sow < target.today) {
        method = 'vasarolt_palanta';
        sow = null;
      }
      if (sow && sow < target.today) continue;
      const harvest = harvestFromStart(start, crop, ctx.frost, w, year);
      const dates: PlantingDates = {
        sow,
        transplant: shift(base.transplant),
        harvestStart: harvest.harvestStart ?? shift(base.harvestStart),
        end: harvest.harvestStart ? harvest.end : shift(base.end),
      };
      const period = occupancyPeriod({
        year,
        method,
        status: 'terv',
        perennial: plant.perennial,
        plan_sow_date: dates.sow,
        plan_transplant_date: dates.transplant,
        plan_harvest_start: dates.harvestStart,
        plan_end_date: dates.end,
        actual_sow_date: null,
        actual_transplant_date: null,
        actual_harvest_start: null,
        actual_end_date: null,
      });
      if (!period) continue;

      // Szabad szakasz a sávon belül
      const range = freeAxisRanges(axis, occupants, period, cross)
        .map(([s, e]) => [Math.max(s, strip.start), Math.min(e, strip.start + strip.span)] as const)
        .find(([s, e]) => e - s + 0.5 >= minSpan);
      if (!range) continue;
      const room = range[1] - range[0];
      const span = target.strip ? room : Math.min(room, spanForRows(defaultRows(rowSpacing), rowSpacing));
      const rows = rowsForSpan(span, rowSpacing);
      return {
        method,
        dates,
        period,
        placement: { axis_start_cm: range[0], axis_span_cm: span, cross_start_cm: cross.start, cross_span_cm: cross.span },
        rows,
        waited: start > first,
      };
    }
  }
  return null;
}

/** A virtuális ültetés az ellenőrzésekhez. */
function virtualPlanting(plant: PlantListItem, fit: Fit, target: SuggestionTarget): PlantingListItem {
  return {
    ...blankPlanting(),
    year: target.year,
    plant_id: plant.id,
    plant_name: plant.name_hu,
    family_id: plant.family_id,
    rotation_stage: plant.rotation_stage,
    nutrient_group: plant.nutrient_group,
    perennial: plant.perennial,
    frost_sensitive: plant.frost_sensitive,
    method: fit.method,
    bed_id: target.bed.id,
    axis_start_cm: fit.placement.axis_start_cm,
    axis_span_cm: fit.placement.axis_span_cm,
    cross_start_cm: fit.placement.cross_start_cm,
    cross_span_cm: fit.placement.cross_span_cm,
    plan_sow_date: fit.dates.sow,
    plan_transplant_date: fit.dates.transplant,
    plan_harvest_start: fit.dates.harvestStart,
    plan_end_date: fit.dates.end,
  };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Pontozás és indoklás egy elhelyezhető javaslathoz. */
function evaluate(plant: PlantListItem, w: GrowingWindow, fit: Fit, input: SuggestionInput, ctx: ChecksContext): Suggestion {
  const { target, seeds } = input;
  const reasons: SuggestionReason[] = [];
  let score = 0;
  const add = (points: number, reason: SuggestionReason) => {
    score += points;
    reasons.push(reason);
  };
  const virtual = virtualPlanting(plant, fit, target);

  // Vetésforgó
  if (!plant.perennial) {
    const history = rotationHistory(virtual, ctx);
    const issues = rotationIssues(toRotationCrop(virtual), history, ctx.families, ctx.currentYear);
    for (const r of issues) add(LEVEL_SCORE[r.level], { level: r.level, text: ROTATION_SHORT[r.code], detail: r.message });
    const past = history.filter((h) => h.year < target.year);
    if (!issues.length && past.length) {
      const next = bedRotationSummary(past, target.year, ctx.families).next;
      if (next && plant.rotation_stage === next) {
        add(25, { level: 'ok', text: `Most ${ROTATION_STAGE_NOUN[next]} következik`, detail: 'A klasszikus vetésforgó (hüvelyes → levél → termés → gyökér) szerint ez a soron következő szakasz.' });
      } else {
        add(10, { level: 'ok', text: 'Vetésforgó rendben' });
      }
    }
  } else {
    add(-15, { level: 'info', text: 'Évelő – évekre foglalja a helyet' });
  }

  // Szomszédok és ágyástársak
  let good = 0;
  for (const h of companionChecks(virtual, ctx)) {
    const other = lower(h.mate.plant_name);
    if (h.relation === 1) {
      if (h.neighbour && good < 3) {
        good++;
        add(10, { level: 'ok', text: `Jó szomszéd: ${other}`, detail: h.reason ?? undefined });
      } else score += 2;
    } else if (h.neighbour) {
      add(-60, { level: 'kerulendo', text: `Rossz szomszéd: ${other}`, detail: h.reason ?? undefined });
    } else {
      add(-10, { level: 'info', text: `Kerülendő ágyástárs: ${other}`, detail: h.reason ?? undefined });
    }
  }

  // Korábbi tapasztalat ezzel a növénnyel
  const tried = ctx.all.filter((p) => p.plant_id === plant.id && p.id !== target.excludeId);
  const rated = tried.filter((p) => p.eval_success).map((p) => p.eval_success!);
  if (rated.length) {
    const a = avg(rated);
    if (a >= 4) add(10, { level: 'ok', text: `Bevált (${a.toFixed(1).replace('.', ',')}★)` });
    else if (a <= 2) add(-10, { level: 'info', text: `Gyengén szerepelt (${a.toFixed(1).replace('.', ',')}★)` });
  }
  const lastVerdict = [...tried].sort((a, b) => b.year - a.year).find((p) => p.eval_recommend)?.eval_recommend;
  if (lastVerdict === 'nem') add(-25, { level: 'figyelem', text: 'Legutóbb: nem termesztem újra' });

  // Vetőmag: a legjobban bevált, majd a legfrissebb készleten lévő fajta
  const stock = seeds
    .filter((x) => x.plant_id === plant.id && x.in_stock)
    .map((x) => {
      const ratings = tried.filter((p) => p.variety_id === x.variety_id && p.eval_success).map((p) => p.eval_success!);
      return { x, rating: ratings.length ? avg(ratings) : 0, viability: seedViability(x.vintage_year, x.seed_viability_years, target.year) };
    })
    .sort((a, b) => b.rating - a.rating || (b.x.vintage_year ?? 0) - (a.x.vintage_year ?? 0))[0];
  const usable = stock && stock.viability !== 'lejart';
  if (fit.method === 'vasarolt_palanta') {
    reasons.push({ level: 'info', text: 'Palántát kell venni' });
  } else if (usable) {
    add(15, { level: 'ok', text: `Van vetőmag: ${stock.x.variety_name}${stock.x.vintage_year ? ` (${stock.x.vintage_year})` : ''}` });
  } else if (stock) {
    add(-5, { level: 'figyelem', text: 'Lejárt vetőmag', detail: `A készleten lévő vetőmag (${stock.x.vintage_year}) valószínűleg gyengén csírázik.` });
  } else {
    // Csak tájékoztatás: a vetőmag beszerezhető, ettől még jó választás lehet
    reasons.push({ level: 'info', text: 'Nincs vetőmag' });
  }

  if (fit.waited) {
    add(-2, { level: 'info', text: `Csak ${shortDate(fit.period.start)} után szabad`, detail: 'Addig más ültetés foglalja a sávot.' });
  }

  // Ajánlott: nincs kerülendő ok, és van legalább egy érdemi mellette szóló (vetésforgó, vetőmag, jó szomszéd, bevált)
  const rank: SuggestionRank = reasons.some((r) => r.level === 'kerulendo') ? 'kerulendo' : score >= 10 ? 'ajanlott' : 'lehetseges';
  return {
    plant,
    window: w,
    method: fit.method,
    dates: fit.dates,
    period: fit.period,
    placement: fit.placement,
    rows: fit.rows,
    variety_id: stock ? stock.x.variety_id : null,
    variety_name: stock ? stock.x.variety_name : null,
    seed_stock_id: stock && fit.method !== 'vasarolt_palanta' ? stock.x.id : null,
    score,
    rank,
    reasons,
  };
}

const RANK_ORDER: Record<SuggestionRank, number> = { ajanlott: 0, lehetseges: 1, kerulendo: 2 };

/** Növényenként a legjobb időszak; rangsor: ajánlott → lehetséges → kerülendő, azon belül pontszám. */
export function suggestPlantings(input: SuggestionInput): Suggestion[] {
  const { target, plants } = input;
  const ctx = target.excludeId ? { ...input.ctx, all: input.ctx.all.filter((p) => p.id !== target.excludeId) } : input.ctx;
  const occupants = occupantsOf(target, ctx.all);
  const out: Suggestion[] = [];
  for (const plant of plants) {
    let best: Suggestion | null = null;
    for (const w of plant.windows) {
      const fit = findFit(plant, w, target, occupants, ctx);
      if (!fit) continue;
      const s = evaluate(plant, w, fit, input, ctx);
      if (!best || s.score > best.score || (s.score === best.score && s.period.start < best.period.start)) best = s;
    }
    if (best) out.push(best);
  }
  return out.sort(
    (a, b) =>
      RANK_ORDER[a.rank] - RANK_ORDER[b.rank] ||
      b.score - a.score ||
      a.period.start.localeCompare(b.period.start) ||
      a.plant.name_hu.localeCompare(b.plant.name_hu, 'hu'),
  );
}
