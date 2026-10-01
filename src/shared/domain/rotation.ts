import {
  nextRotationStage,
  ROTATION_STAGE_NOUN,
  type CheckLevel,
  type NutrientGroup,
  type RotationStage,
} from '../labels.ts';
import { capitalize, yearFrom, yearIn } from '../text.ts';
import type { Period } from './geometry.ts';
import { shortDate } from './isoDate.ts';

/** Egy ültetés a vetésforgó szempontjából. */
export interface RotationCrop {
  id: number;
  year: number;
  plant_id: number;
  plant_name: string;
  family_id: number | null;
  rotation_stage: RotationStage | null;
  nutrient_group: NutrientGroup | null;
  perennial: boolean;
  series_id: string | null;
  /** Az ágyásban töltött időszak (dátum nélküli előzménynél nincs) */
  period: Period | null;
  /** Megtörtént (tény vagy rögzített előzmény) – különben csak terv */
  confirmed: boolean;
}

export interface FamilyInfo {
  name_hu: string;
  rotation_gap_years: number;
}

export type RotationCode = 'ugyanaz' | 'csalad' | 'tapanyag' | 'szakasz' | 'szakasz_kimarad' | 'utovetemeny';

export interface RotationIssue {
  level: CheckLevel;
  code: RotationCode;
  message: string;
  /** Az érintett korábbi ültetések */
  refs: number[];
}

/** Ennyi évre visszamenőleg nézzük az előzményeket (a leghosszabb családi szünetnél több). */
export const ROTATION_LOOKBACK_YEARS = 6;

const lower = (s: string) => s.toLocaleLowerCase('hu');

/**
 * Vetésforgó-ellenőrzés egy ültetésre az ugyanazon a helyen korábban állt növények alapján
 * (a hívó adja át a térben átfedő előzményeket):
 * 1. ugyanaz a növény két egymást követő évben,
 * 2. ugyanaz a család a családi szünet letelte előtt,
 * 3. két egymást követő évben erős tápanyagigény,
 * 4. a vetésforgó-szakasz ismétlődése, illetve a klasszikus sorrendtől eltérés,
 * 5. éven belüli utóvetemény ugyanabból a családból.
 */
export function rotationIssues(
  crop: RotationCrop,
  history: RotationCrop[],
  families: Map<number, FamilyInfo>,
  currentYear: number,
): RotationIssue[] {
  if (crop.perennial) return [];
  const out: RotationIssue[] = [];
  const when = (h: RotationCrop) =>
    `${yearIn(h.year)}${!h.confirmed && h.year < currentYear ? ' (a terv szerint)' : ''}`;
  const past = history.filter((h) => h.year < crop.year).sort((a, b) => b.year - a.year);
  const lastYear = past.filter((h) => h.year === crop.year - 1);

  // 1. Ugyanaz a növény tavaly
  const same = lastYear.filter((h) => h.plant_id === crop.plant_id);
  if (same.length) {
    out.push({
      level: 'kerulendo',
      code: 'ugyanaz',
      message: `${capitalize(lower(crop.plant_name))} ${when(same[0]!)} is itt volt – ugyanaz a növény két egymást követő évben ne kerüljön ugyanoda.`,
      refs: same.map((h) => h.id),
    });
  }

  // 2. Ugyanaz a család a szünet letelte előtt
  const family = crop.family_id != null ? families.get(crop.family_id) : undefined;
  if (family) {
    const hits = past.filter(
      (h) =>
        h.family_id === crop.family_id &&
        crop.year - h.year < family.rotation_gap_years &&
        !same.some((s) => s.id === h.id),
    );
    if (hits.length) {
      const nearest = hits[0]!;
      out.push({
        level: crop.year - nearest.year === 1 && !same.length ? 'kerulendo' : 'figyelem',
        code: 'csalad',
        message: `${family.name_hu}: legalább ${family.rotation_gap_years} évnek kell eltelnie, mielőtt ugyanoda kerülnek – ${when(nearest)} ${lower(nearest.plant_name)} volt itt (${yearFrom(nearest.year + family.rotation_gap_years)} lehet újra).`,
        refs: hits.map((h) => h.id),
      });
    }
  }

  // 3. Tápanyagigény: erős után erős
  if (crop.nutrient_group === 1) {
    const heavy = lastYear.find((h) => h.nutrient_group === 1);
    if (heavy) {
      out.push({
        level: 'figyelem',
        code: 'tapanyag',
        message: `Két egymást követő évben erős tápanyagigényű növény (${when(heavy)} ${lower(heavy.plant_name)}) – a talaj kimerül, szerves trágyával pótold a tápanyagot.`,
        refs: [heavy.id],
      });
    }
  }

  // 4. Vetésforgó-szakasz
  if (crop.rotation_stage) {
    const staged = lastYear.filter((h) => !h.perennial && h.rotation_stage);
    const stages = [...new Set(staged.map((h) => h.rotation_stage!))];
    if (stages.includes(crop.rotation_stage)) {
      // Ugyanannál a növénynél a fenti, erősebb jelzés elég
      if (!same.length) {
        const h = staged.find((x) => x.rotation_stage === crop.rotation_stage)!;
        out.push({
          level: 'figyelem',
          code: 'szakasz',
          message: `Ugyanaz a vetésforgó-szakasz egymás után: ${when(h)} is ${ROTATION_STAGE_NOUN[crop.rotation_stage]} (${lower(h.plant_name)}) volt itt.`,
          refs: staged.filter((x) => x.rotation_stage === crop.rotation_stage).map((x) => x.id),
        });
      }
    } else if (stages.length === 1 && crop.rotation_stage !== nextRotationStage(stages[0]!)) {
      const prev = stages[0]!;
      out.push({
        level: 'info',
        code: 'szakasz_kimarad',
        message: `A klasszikus sorrendben (hüvelyes → levél → termés → gyökér) ${ROTATION_STAGE_NOUN[prev]} után ${ROTATION_STAGE_NOUN[nextRotationStage(prev)]} következne.`,
        refs: staged.map((x) => x.id),
      });
    }
  }

  // 5. Éven belüli utóvetemény ugyanabból a családból
  if (crop.period && crop.family_id != null) {
    const before = history
      .filter(
        (h) =>
          h.year === crop.year &&
          h.period &&
          h.period.end <= crop.period!.start &&
          h.family_id === crop.family_id &&
          !(crop.series_id && h.series_id === crop.series_id),
      )
      .sort((a, b) => b.period!.end.localeCompare(a.period!.end));
    const h = before[0];
    if (h) {
      out.push(
        h.plant_id === crop.plant_id
          ? {
              level: 'info',
              code: 'utovetemeny',
              message: `Ugyanebben az évben előtte is ${lower(h.plant_name)} áll itt (${shortDate(h.period!.start)} – ${shortDate(h.period!.end)}).`,
              refs: [h.id],
            }
          : {
              level: 'figyelem',
              code: 'utovetemeny',
              message: `${family?.name_hu ?? 'Azonos család'} egymás után ugyanabban az évben (${lower(h.plant_name)} → ${lower(crop.plant_name)}): a kártevők és betegségek felhalmozódhatnak.`,
              refs: [h.id],
            },
      );
    }
  }
  return out;
}

export interface BedRotationSummary {
  /** A legutóbbi év, amikor vetésforgó-szakaszba sorolt növény állt itt */
  last: { year: number; stages: RotationStage[] } | null;
  /** A klasszikus sorrend szerint következő szakasz (ha a legutóbbi év egyértelmű) */
  next: RotationStage | null;
  /** Családok, amelyek a szünet miatt még nem kerülhetnek ide (`from`: ettől az évtől újra) */
  blocked: { family_id: number; name: string; from: number; lastYear: number; plant: string }[];
}

/** Ágyás-szintű összegzés a következő év tervezéséhez. */
export function bedRotationSummary(
  history: RotationCrop[],
  year: number,
  families: Map<number, FamilyInfo>,
): BedRotationSummary {
  const past = history.filter((h) => h.year < year);
  const staged = past.filter((h) => !h.perennial && h.rotation_stage);
  const lastYear = staged.length ? Math.max(...staged.map((h) => h.year)) : null;
  const stages = lastYear
    ? [...new Set(staged.filter((h) => h.year === lastYear).map((h) => h.rotation_stage!))]
    : [];

  const latestByFamily = new Map<number, RotationCrop>();
  for (const h of past) {
    if (h.family_id == null) continue;
    const prev = latestByFamily.get(h.family_id);
    if (!prev || h.year > prev.year) latestByFamily.set(h.family_id, h);
  }
  const blocked = [...latestByFamily.entries()]
    .flatMap(([familyId, h]) => {
      const f = families.get(familyId);
      if (!f) return [];
      const from = h.year + f.rotation_gap_years;
      return from > year ? [{ family_id: familyId, name: f.name_hu, from, lastYear: h.year, plant: h.plant_name }] : [];
    })
    .sort((a, b) => b.from - a.from || a.name.localeCompare(b.name, 'hu'));

  return {
    last: lastYear ? { year: lastYear, stages } : null,
    next: stages.length === 1 ? nextRotationStage(stages[0]!) : null,
    blocked,
  };
}
