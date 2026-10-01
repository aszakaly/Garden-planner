import type { CheckLevel } from '../labels.ts';
import { yearIn } from '../text.ts';
import type { Bed, GrowingWindow, PlantingListItem } from '../types.ts';
import { companionHits, type CompanionHit, type CompanionIndex } from './companions.ts';
import { checkDates, type FrostDates } from './dates.ts';
import { findClashes, outsideBed, periodsOverlap, placementsOverlap } from './geometry.ts';
import { shortDate } from './isoDate.ts';
import { effectiveBedId, effectiveDates, occupancyPeriod, placementOf } from './plantings.ts';
import { ROTATION_LOOKBACK_YEARS, rotationIssues, type FamilyInfo, type RotationCrop } from './rotation.ts';
import { seedViability } from './seeds.ts';

/**
 * Egy év ültetéseinek összes ellenőrzése egy helyen: vetésforgó, társítás, helyütközés,
 * dátumok és fagy, vetőmag, elhelyezés. A felület ebből építi a „Figyelmeztetések” listát,
 * a sorok címkéit és az oldalsáv számlálóját.
 */

export type IssueCategory = 'vetesforgo' | 'tarsitas' | 'utkozes' | 'datum' | 'vetomag' | 'elhelyezes';

export const ISSUE_CATEGORIES: IssueCategory[] = ['vetesforgo', 'tarsitas', 'utkozes', 'datum', 'vetomag', 'elhelyezes'];
export const ISSUE_CATEGORY_LABEL: Record<IssueCategory, string> = {
  vetesforgo: 'Vetésforgó',
  tarsitas: 'Társítás',
  utkozes: 'Helyütközés',
  datum: 'Dátumok és fagy',
  vetomag: 'Vetőmag',
  elhelyezes: 'Elhelyezés',
};

export type IssueLevel = CheckLevel | 'ok';
export const LEVEL_RANK: Record<IssueLevel, number> = { kerulendo: 0, figyelem: 1, info: 2, ok: 3 };

export interface PlantingIssue {
  /** Egyedi kulcs – a két ültetést érintő jelzésnél (ütközés, társítás) mindkét oldalon ugyanaz */
  key: string;
  plantingId: number;
  category: IssueCategory;
  level: IssueLevel;
  message: string;
  /** Rövid címke a listasorokhoz (üres: nem jelenik meg címkeként) */
  chip: string;
  refs: number[];
  /** Társításnál a másik növény neve és hogy közvetlen szomszéd-e */
  other?: string;
  neighbour?: boolean;
}

export interface ChecksContext {
  /** Az ellenőrzött év és a megelőző évek ültetései (az előzményekhez) */
  all: PlantingListItem[];
  beds: Bed[];
  families: Map<number, FamilyInfo>;
  companions: CompanionIndex;
  frost: FrostDates;
  currentYear: number;
  /** Termesztési időszakok azonosító szerint (a javasolt időszak ellenőrzéséhez) */
  windows?: Map<number, GrowingWindow>;
}

const lower = (s: string) => s.toLocaleLowerCase('hu');

/** Megtörtént-e az ültetés (rögzített előzmény, tény dátum vagy előrehaladott státusz). */
export function isConfirmed(p: PlantingListItem): boolean {
  return (
    p.is_history ||
    p.status === 'folyamatban' ||
    p.status === 'lezart' ||
    p.status === 'sikertelen' ||
    !!(p.actual_sow_date || p.actual_transplant_date || p.actual_harvest_start || p.actual_end_date)
  );
}

export function toRotationCrop(p: PlantingListItem): RotationCrop {
  return {
    id: p.id,
    year: p.year,
    plant_id: p.plant_id,
    plant_name: p.plant_name,
    family_id: p.family_id,
    rotation_stage: p.rotation_stage,
    nutrient_group: p.nutrient_group,
    perennial: p.perennial,
    series_id: p.series_id,
    period: occupancyPeriod(p),
    confirmed: isConfirmed(p),
  };
}

/**
 * Ami az ültetés helyén korábban (és az évben előtte) állt: ugyanaz az ágyás, térben átfedő sáv.
 * Ha valamelyiknek nincs kijelölt sávja, az egész ágyást vesszük.
 */
export function rotationHistory(p: PlantingListItem, ctx: ChecksContext): RotationCrop[] {
  const bedId = effectiveBedId(p);
  if (bedId == null) return [];
  const bed = ctx.beds.find((b) => b.id === bedId);
  const place = bed ? placementOf(p, bed) : null;
  return ctx.all
    .filter(
      (h) =>
        h.id !== p.id &&
        effectiveBedId(h) === bedId &&
        h.status !== 'elmaradt' &&
        h.year <= p.year &&
        h.year >= p.year - ROTATION_LOOKBACK_YEARS,
    )
    .filter((h) => {
      if (!bed || !place) return true;
      const hp = placementOf(h, bed);
      return !hp || placementsOverlap(place, hp);
    })
    .map(toRotationCrop);
}

export function rotationChecks(p: PlantingListItem, ctx: ChecksContext): PlantingIssue[] {
  if (effectiveBedId(p) == null) return [];
  return rotationIssues(toRotationCrop(p), rotationHistory(p, ctx), ctx.families, ctx.currentYear).map((r) => ({
    key: `vetesforgo:${p.id}:${r.code}`,
    plantingId: p.id,
    category: 'vetesforgo',
    level: r.level,
    message: r.message,
    chip: r.code === 'tapanyag' ? 'Tápanyag' : 'Vetésforgó',
    refs: r.refs,
  }));
}

/** Az időben átfedő ágyástársakkal való kapcsolat. */
export function companionChecks(p: PlantingListItem, ctx: ChecksContext): CompanionHit[] {
  const bedId = effectiveBedId(p);
  const period = occupancyPeriod(p);
  if (bedId == null || !period) return [];
  const bed = ctx.beds.find((b) => b.id === bedId);
  const mates = ctx.all.flatMap((o) => {
    if (o.id === p.id || effectiveBedId(o) !== bedId) return [];
    const other = occupancyPeriod(o);
    if (!other || !periodsOverlap(other, period)) return [];
    return [{ id: o.id, plant_id: o.plant_id, plant_name: o.plant_name, placement: bed ? placementOf(o, bed) : null, period: other }];
  });
  return companionHits({ plant_id: p.plant_id, placement: bed ? placementOf(p, bed) : null }, mates, ctx.companions);
}

const why = (reason: string | null) => {
  if (!reason) return '.';
  const r = reason.trim().replace(/\.$/, '');
  return ` – ${r.charAt(0).toLocaleLowerCase('hu')}${r.slice(1)}.`;
};

export function companionIssue(p: PlantingListItem, hit: CompanionHit): PlantingIssue {
  const other = lower(hit.mate.plant_name);
  const message =
    hit.relation === 1
      ? `Jó ${hit.neighbour ? 'szomszéd' : 'ágyástárs'}: ${other}${why(hit.reason)}`
      : hit.neighbour
        ? `Kerülendő szomszéd: ${other} közvetlenül mellette áll${why(hit.reason)}`
        : `Kerülendő társ ugyanabban az ágyásban: ${other}${why(hit.reason)}`;
  const [a, b] = p.id < hit.mate.id ? [p.id, hit.mate.id] : [hit.mate.id, p.id];
  return {
    key: `tarsitas:${a}-${b}`,
    plantingId: p.id,
    category: 'tarsitas',
    level: hit.level,
    message,
    // A távolabbi ágyástárs csak a szerkesztőben és a teljes listában jelenik meg, címkeként nem
    chip: hit.neighbour ? `${hit.relation === 1 ? 'Jó' : 'Rossz'} szomszéd: ${other}` : '',
    refs: [hit.mate.id],
    other,
    neighbour: hit.neighbour,
  };
}

const DATE_CHIP = { sorrend: 'Hibás dátum', fagy: 'Fagyveszély', oszi_fagy: 'Őszi fagy', idoszak: 'Időszakon kívül' } as const;

/** Dátum-, vetőmag- és elhelyezési jelzések (csak tervezett, nem előzményként rögzített ültetésre). */
export function plantingDetailChecks(p: PlantingListItem, ctx: ChecksContext): PlantingIssue[] {
  if (p.is_history) return [];
  const out: PlantingIssue[] = [];
  const issue = (category: IssueCategory, code: string, level: IssueLevel, chip: string, message: string) =>
    out.push({ key: `${category}:${p.id}:${code}`, plantingId: p.id, category, level, chip, message, refs: [] });

  if (p.method) {
    const dates = checkDates({
      dates: effectiveDates(p),
      method: p.method,
      window: p.window_id ? ctx.windows?.get(p.window_id) : null,
      crop: {
        daysToHarvest: p.days_to_harvest,
        harvestDurationDays: p.harvest_duration_days,
        frostSensitive: p.frost_sensitive,
        perennial: p.perennial,
      },
      frost: ctx.frost,
    });
    for (const d of dates) issue('datum', `${d.code}:${d.field}`, d.level, DATE_CHIP[d.code], d.message);
  }

  if (p.method !== 'vasarolt_palanta') {
    const viability = seedViability(p.seed_vintage, p.seed_viability_years, p.year);
    if (viability === 'lejart') {
      issue('vetomag', 'lejart', 'figyelem', 'Lejárt vetőmag',
        `A kiválasztott vetőmag évjárata ${p.seed_vintage} – ${yearIn(p.year)} már valószínűleg gyengén csírázik; vetés előtt végezz csíráztatási próbát.`);
    } else if (viability === 'utolso') {
      issue('vetomag', 'utolso', 'info', 'Utolsó jó év',
        `A kiválasztott vetőmag (évjárat: ${p.seed_vintage}) ${yearIn(p.year)} csírázik utoljára megbízhatóan.`);
    }
    if (!p.has_seed && p.year >= ctx.currentYear) {
      issue('vetomag', 'nincs', 'info', 'Nincs vetőmag', 'Nincs belőle vetőmag készleten – be kell szerezni.');
    }
  }

  const bedId = effectiveBedId(p);
  const bed = ctx.beds.find((b) => b.id === bedId);
  if (bedId == null) {
    issue('elhelyezes', 'nincs_agyas', 'info', 'Nincs ágyás', 'Még nincs ágyáshoz rendelve.');
  } else if (bed) {
    const place = placementOf(p, bed);
    if (!place) {
      issue('elhelyezes', 'nincs_sav', 'info', 'Nincs kijelölt sávja',
        'Az ágyáson belül nincs kijelölt sávja – az ütközést és a szomszédokat nem lehet pontosan ellenőrizni.');
    } else if (outsideBed(place, bed)) {
      issue('elhelyezes', 'kilog', 'figyelem', 'Kilóg az ágyásból', 'A kijelölt sáv kilóg az ágyásból.');
    }
  }
  return out;
}

/** Helyütközések: minden érintett ültetésnél (az előző évről áthúzódókat is beleértve). */
export function clashChecks(year: number, ctx: ChecksContext): PlantingIssue[] {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;
  const out: PlantingIssue[] = [];
  for (const bed of ctx.beds) {
    const placed = ctx.all.flatMap((p) => {
      if (effectiveBedId(p) !== bed.id) return [];
      const period = occupancyPeriod(p);
      const placement = placementOf(p, bed);
      if (!period || !placement || period.end <= yearStart || period.start >= yearEnd) return [];
      return [{ id: p.id, planting: p, placement, period }];
    });
    for (const c of findClashes(placed)) {
      const a = placed.find((x) => x.id === c.a)!.planting;
      const b = placed.find((x) => x.id === c.b)!.planting;
      for (const [self, other] of [[a, b], [b, a]] as const) {
        out.push({
          key: `utkozes:${c.a}-${c.b}`,
          plantingId: self.id,
          category: 'utkozes',
          level: 'kerulendo',
          chip: `Ütközik: ${lower(other.plant_name)}`,
          message: `Helyütközés ${shortDate(c.period.start)} – ${shortDate(c.period.end)}: ${lower(a.plant_name)} és ${lower(b.plant_name)} ugyanazt a sávot foglalná.`,
          refs: [other.id],
        });
      }
    }
  }
  return out;
}

/** Az év összes ültetésének jelzései. */
export function checkYear(year: number, ctx: ChecksContext): PlantingIssue[] {
  const items = ctx.all.filter((p) => p.year === year && p.status !== 'elmaradt');
  return [
    ...items.flatMap((p) => [
      ...rotationChecks(p, ctx),
      ...companionChecks(p, ctx).map((h) => companionIssue(p, h)),
      ...plantingDetailChecks(p, ctx),
    ]),
    ...clashChecks(year, ctx),
  ];
}

/** A páros jelzések egyszer szerepeljenek (pl. a Figyelmeztetések listában). */
export function uniqueIssues(issues: PlantingIssue[]): PlantingIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}
