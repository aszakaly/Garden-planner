import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './index.ts';
import { transaction } from './index.ts';
import { insert } from './helpers.ts';
import { DEFAULT_SETTINGS } from '../../shared/settings.ts';

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'seed');

interface SeedWindow {
  season: string;
  method: string;
  sow?: [string, string];
  seedling_weeks?: number;
  transplant?: [string, string];
  harvest?: [string, string];
  harvest_year_offset?: number;
  succession_days?: number;
  notes?: string;
}

interface SeedPlant {
  code: string;
  name_hu: string;
  name_latin: string;
  family: string;
  crop_group: string;
  rotation_stage?: string | null;
  nutrient_group: number;
  perennial?: boolean;
  frost_sensitive?: boolean;
  in_row_spacing_cm?: number;
  row_spacing_cm?: number;
  days_to_harvest?: number;
  harvest_duration_days?: number;
  seed_viability_years?: number | null;
  sun?: string;
  aliases_en: string[];
  notes?: string | null;
  windows: SeedWindow[];
}

const read = <T>(file: string): T => JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8'));

/** A kezdő növényadatok forrása (a 004-es migráció a meglévő adatbázisokban is erre cseréli a korábbi szöveget). */
export const PLANT_DATA_SOURCE =
  'Vetési, kiültetési és betakarítási időszak: magyar vetési naptárak (kertvar.hu, agroinform.hu, kertlap.hu). ' +
  'Tő- és sortáv, tenyészidő: általános kertészeti alapérték, ahol volt adat, összevetve a Rédei Kertimag tasakadataival, ' +
  'az origo.hu házikerti helyigény-táblázatával és a kertforum.hu tenyészidő-táblázatával.';
export const COMPANION_SOURCE = 'windrivergreens';

/** Üres adatbázisba betölti a kezdő törzsadatokat. Visszaadja, hogy történt-e betöltés. */
export function seedIfEmpty(db: DB): boolean {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM plant_family').get() as { n: number };
  if (n > 0) return false;
  transaction(db, () => seedAll(db));
  return true;
}

function seedAll(db: DB): void {
  const familyId = new Map<string, number>();
  for (const f of read<Record<string, unknown>[]>('families.json')) {
    familyId.set(String(f.code), insert(db, 'plant_family', f));
  }

  const groupId = new Map<string, number>();
  const groupStage = new Map<string, string | null>();
  for (const g of read<Record<string, unknown>[]>('crop_groups.json')) {
    groupId.set(String(g.code), insert(db, 'crop_group', g));
    groupStage.set(String(g.code), (g.rotation_stage as string) ?? null);
  }

  const plantId = new Map<string, number>();
  for (const p of read<SeedPlant[]>('plants.hu.json')) {
    const id = insert(db, 'plant', {
      code: p.code,
      name_hu: p.name_hu,
      name_latin: p.name_latin,
      family_id: familyId.get(p.family) ?? null,
      crop_group_id: groupId.get(p.crop_group) ?? null,
      rotation_stage: p.rotation_stage !== undefined ? p.rotation_stage : (groupStage.get(p.crop_group) ?? null),
      nutrient_group: p.nutrient_group,
      perennial: p.perennial ?? false,
      frost_sensitive: p.frost_sensitive ?? false,
      in_row_spacing_cm: p.in_row_spacing_cm,
      row_spacing_cm: p.row_spacing_cm,
      days_to_harvest: p.days_to_harvest,
      harvest_duration_days: p.harvest_duration_days,
      seed_viability_years: p.seed_viability_years,
      sun: p.sun,
      aliases_en: p.aliases_en,
      notes: p.notes,
      data_status: 'alapertek',
      source: PLANT_DATA_SOURCE,
    });
    plantId.set(p.code, id);
    for (const w of p.windows) {
      insert(db, 'growing_window', {
        plant_id: id,
        season: w.season,
        method: w.method,
        sow_start: w.sow?.[0],
        sow_end: w.sow?.[1],
        seedling_weeks: w.seedling_weeks,
        transplant_start: w.transplant?.[0],
        transplant_end: w.transplant?.[1],
        harvest_start: w.harvest?.[0],
        harvest_end: w.harvest?.[1],
        harvest_year_offset: w.harvest_year_offset ?? 0,
        succession_days: w.succession_days,
        notes: w.notes,
      });
    }
  }

  const companions = read<{ a: string; b: string; relation: number; reason_hu: string; evidence: unknown }[]>(
    'companions.json',
  );
  for (const c of companions) {
    const a = plantId.get(c.a);
    const b = plantId.get(c.b);
    if (a === undefined || b === undefined) continue;
    insert(db, 'companion', {
      plant_a_id: Math.min(a, b),
      plant_b_id: Math.max(a, b),
      relation: c.relation,
      reason: c.reason_hu,
      source: COMPANION_SOURCE,
      evidence: c.evidence,
    });
  }

  insert(db, 'garden', { name: 'Kertem', location: DEFAULT_SETTINGS.region });
}
