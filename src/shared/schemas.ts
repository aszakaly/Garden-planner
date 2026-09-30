import { z } from 'zod';
import { DATA_STATUS, ROTATION_STAGES, SEASONS, SUN_VALUES, WINDOW_METHODS } from './labels.ts';

export const monthDay = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'HH-NN formátum kell (pl. 03-15)');

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();
const posInt = (max: number) => z.number().int().min(0).max(max);

export const familyInput = z.object({
  name_hu: text(100).min(1, 'Név megadása kötelező'),
  name_latin: optText(150),
  rotation_gap_years: z.number().int().min(1).max(10),
  notes: optText(2000),
});
export type FamilyInput = z.infer<typeof familyInput>;

export const cropGroupInput = z.object({
  name_hu: text(100).min(1, 'Név megadása kötelező'),
  description: optText(1000),
  rotation_stage: z.enum(ROTATION_STAGES).nullish(),
  sort_order: z.number().int().min(0).max(999).default(0),
});
export type CropGroupInput = z.infer<typeof cropGroupInput>;

export const plantInput = z.object({
  name_hu: text(100).min(1, 'Név megadása kötelező'),
  name_latin: optText(150),
  family_id: z.number().int().nullish(),
  crop_group_id: z.number().int().nullish(),
  rotation_stage: z.enum(ROTATION_STAGES).nullish(),
  nutrient_group: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullish(),
  perennial: z.boolean().default(false),
  frost_sensitive: z.boolean().default(false),
  in_row_spacing_cm: posInt(1000).nullish(),
  row_spacing_cm: posInt(1000).nullish(),
  days_to_harvest: posInt(1000).nullish(),
  harvest_duration_days: posInt(1000).nullish(),
  seed_viability_years: posInt(50).nullish(),
  sun: z.enum(SUN_VALUES).nullish(),
  aliases_en: z.array(text(100)).default([]),
  notes: optText(4000),
  data_status: z.enum(DATA_STATUS).default('sajat'),
});
export type PlantInput = z.infer<typeof plantInput>;

const rangeComplete = (a?: string | null, b?: string | null) => (a == null) === (b == null);

export const windowInput = z
  .object({
    season: z.enum(SEASONS),
    method: z.enum(WINDOW_METHODS),
    sow_start: monthDay.nullish(),
    sow_end: monthDay.nullish(),
    seedling_weeks: z.number().int().min(1).max(30).nullish(),
    transplant_start: monthDay.nullish(),
    transplant_end: monthDay.nullish(),
    harvest_start: monthDay.nullish(),
    harvest_end: monthDay.nullish(),
    harvest_year_offset: z.union([z.literal(0), z.literal(1)]).default(0),
    succession_days: z.number().int().min(1).max(120).nullish(),
    notes: optText(1000),
  })
  .refine((w) => rangeComplete(w.sow_start, w.sow_end), {
    message: 'A vetési időszak kezdetét és végét is add meg',
    path: ['sow_end'],
  })
  .refine((w) => rangeComplete(w.transplant_start, w.transplant_end), {
    message: 'A kiültetési időszak kezdetét és végét is add meg',
    path: ['transplant_end'],
  })
  .refine((w) => rangeComplete(w.harvest_start, w.harvest_end), {
    message: 'A betakarítási időszak kezdetét és végét is add meg',
    path: ['harvest_end'],
  })
  .refine((w) => w.method !== 'palanta' || (w.transplant_start && w.seedling_weeks), {
    message: 'Palántánál a kiültetési időszak és a nevelés hossza is kell',
    path: ['transplant_start'],
  })
  .refine((w) => w.sow_start || w.transplant_start, {
    message: 'Legalább a vetési vagy a kiültetési időszakot add meg',
    path: ['sow_start'],
  });
export type WindowInput = z.infer<typeof windowInput>;

export const varietyInput = z.object({
  name: text(100).min(1, 'Név megadása kötelező'),
  description: optText(2000),
  days_to_harvest: posInt(1000).nullish(),
  in_row_spacing_cm: posInt(1000).nullish(),
  row_spacing_cm: posInt(1000).nullish(),
  notes: optText(4000),
});
export type VarietyInput = z.infer<typeof varietyInput>;

export const companionInput = z
  .object({
    plant_a_id: z.number().int(),
    plant_b_id: z.number().int(),
    relation: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    reason: optText(500),
  })
  .refine((c) => c.plant_a_id !== c.plant_b_id, { message: 'Két különböző növény kell', path: ['plant_b_id'] });
export type CompanionInput = z.infer<typeof companionInput>;
