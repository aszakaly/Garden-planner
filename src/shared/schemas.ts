import { z } from 'zod';
import {
  BED_TYPES,
  DATA_STATUS,
  EVAL_RECOMMEND,
  JOURNAL_TYPES,
  LIST_COLOR_NAMES,
  PLANTING_METHODS,
  PLANTING_STATUSES,
  PLAN_YEAR_STATUSES,
  ROTATION_STAGES,
  ROW_DIRECTIONS,
  SEASONS,
  SEED_ORIGINS,
  SUN_VALUES,
  WINDOW_METHODS,
} from './labels.ts';

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

const year = z.number().int().min(1950, 'Érvénytelen év').max(2200, 'Érvénytelen év');

export const seedStockInput = z
  .object({
    /** Meglévő fajta … */
    variety_id: z.number().int().nullish(),
    /** … vagy új fajta a növény és a név alapján (ha már létezik ilyen nevű, azt használja) */
    plant_id: z.number().int().nullish(),
    variety_name: optText(100),
    supplier: optText(150),
    origin_type: z.enum(SEED_ORIGINS).default('vasarolt'),
    vintage_year: year.nullish(),
    in_stock: z.boolean().default(true),
    quantity: optText(100),
    notes: optText(2000),
  })
  .refine((s) => s.variety_id || (s.plant_id && s.variety_name), {
    message: 'Válassz fajtát, vagy adj meg új fajtanevet',
    path: ['variety_name'],
  });
export type SeedStockInput = z.infer<typeof seedStockInput>;

export const gardenInput = z.object({
  name: text(100).min(1, 'Név megadása kötelező'),
  location: optText(200),
  notes: optText(2000),
});
export type GardenInput = z.infer<typeof gardenInput>;

/** Az ágyásnév leghosszabb megengedett hossza; a sorszámozott nevekre is vonatkozik. */
export const BED_NAME_MAX = 100;

export const bedInput = z
  .object({
    garden_id: z.number().int().optional(),
    name: text(BED_NAME_MAX).min(1, 'Név megadása kötelező'),
    color: z.enum(LIST_COLOR_NAMES).default('green'),
    length_cm: z.number({ error: 'A hossz megadása kötelező' }).int().min(10, 'Legalább 10 cm').max(100_000),
    width_cm: z.number({ error: 'A szélesség megadása kötelező' }).int().min(10, 'Legalább 10 cm').max(100_000),
    row_direction: z.enum(ROW_DIRECTIONS).default('keresztben'),
    pos_x_cm: z.number().int().nullish(),
    pos_y_cm: z.number().int().nullish(),
    rotation_deg: z.number().int().min(0).max(359).default(0),
    bed_type: z.enum(BED_TYPES).default('foldagyas'),
    sun: z.enum(SUN_VALUES).nullish(),
    soil: optText(500),
    irrigation: optText(200),
    notes: optText(4000),
    active_from_year: year.nullish(),
    active_to_year: year.nullish(),
    sort_order: z.number().int().min(0).max(9999).default(0),
  })
  .refine((b) => !b.active_from_year || !b.active_to_year || b.active_from_year <= b.active_to_year, {
    message: 'A használat vége nem lehet korábbi a kezdeténél',
    path: ['active_to_year'],
  });
export type BedInput = z.infer<typeof bedInput>;

/** Több egyforma ágyás egyszerre: a nevük sorszámot kap (lásd `numberedNames`). */
export const bedBatchInput = z.object({
  bed: bedInput,
  count: z.number().int().min(2, 'Legalább 2 darab').max(50, 'Egyszerre legfeljebb 50 ágyás'),
});
export type BedBatchInput = z.infer<typeof bedBatchInput>;

export const isoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'ÉÉÉÉ-HH-NN formátum kell');
const cm = z.number().min(0).max(100_000);

export const plantingInput = z.object({
  year: z
    .number({ error: 'Az év megadása kötelező' })
    .int('Érvénytelen év')
    .min(1900, 'Érvénytelen év')
    .max(2200, 'Érvénytelen év'),
  plant_id: z.number({ error: 'Válassz növényt' }).int(),
  variety_id: z.number().int().nullish(),
  seed_stock_id: z.number().int().nullish(),
  bed_id: z.number().int().nullish(),
  axis_start_cm: cm.nullish(),
  axis_span_cm: cm.positive().nullish(),
  cross_start_cm: cm.nullish(),
  cross_span_cm: cm.positive().nullish(),
  rows: z.number().int().min(1).max(1000).nullish(),
  plant_count: z.number().int().min(0).max(1_000_000).nullish(),
  method: z.enum(PLANTING_METHODS).nullish(),
  window_id: z.number().int().nullish(),
  plan_sow_date: isoDate.nullish(),
  plan_transplant_date: isoDate.nullish(),
  plan_harvest_start: isoDate.nullish(),
  plan_end_date: isoDate.nullish(),
  is_history: z.boolean().default(false),
  notes: optText(4000),
});
export type PlantingInput = z.infer<typeof plantingInput>;

/** Új ültetés, opcionálisan újravetés-sorozatként (a további tagok időben eltolva, szabad sávba kerülnek). */
export const plantingCreateInput = plantingInput.extend({
  series: z
    .object({
      count: z.number().int().min(2, 'Legalább 2 vetés kell').max(20, 'Legfeljebb 20 vetés'),
      interval_days: z.number().int().min(1).max(180),
    })
    .nullish(),
});
export type PlantingCreateInput = z.infer<typeof plantingCreateInput>;

/** Generált vagy saját feladat állapotának módosítása (csak a megadott mezők változnak). */
export const taskStatePatch = z.object({
  /** Elvégezve ezen a napon; null: visszavonás */
  done_on: isoDate.nullable().optional(),
  /** Áthelyezés másik napra; null: vissza a terv szerinti napra */
  moved_to: isoDate.nullable().optional(),
  note: optText(2000),
});
export type TaskStatePatch = z.infer<typeof taskStatePatch>;

export const customTaskInput = z.object({
  title: z.string().trim().min(1, 'Add meg a feladatot').max(200),
  due_date: isoDate,
  bed_id: z.number().int().positive().nullish(),
  planting_id: z.number().int().positive().nullish(),
  notes: optText(2000),
  done_at: isoDate.nullish(),
});
export type CustomTaskInput = z.infer<typeof customTaskInput>;

const optId = z.number().int().positive().nullish();

/** Az ültetés tényleges megvalósulása és szezonvégi értékelése (csak a megadott mezők változnak). */
export const plantingActualInput = z.object({
  status: z.enum(PLANTING_STATUSES).optional(),
  actual_sow_date: isoDate.nullish(),
  actual_transplant_date: isoDate.nullish(),
  actual_harvest_start: isoDate.nullish(),
  actual_end_date: isoDate.nullish(),
  actual_bed_id: optId,
  actual_axis_start_cm: cm.nullish(),
  actual_axis_span_cm: cm.positive().nullish(),
  actual_cross_start_cm: cm.nullish(),
  actual_cross_span_cm: cm.positive().nullish(),
  eval_success: z.number().int().min(1).max(5).nullish(),
  eval_yield: optText(200),
  eval_recommend: z.enum(EVAL_RECOMMEND).nullish(),
  eval_notes: optText(4000),
});
export type PlantingActualInput = z.infer<typeof plantingActualInput>;

export const journalInput = z
  .object({
    entry_date: isoDate,
    entry_type: z.enum(JOURNAL_TYPES).default('megfigyeles'),
    planting_id: optId,
    plant_id: optId,
    variety_id: optId,
    bed_id: optId,
    body: z.string().trim().max(10_000).default(''),
    amount: z.number().min(0).max(1_000_000).nullish(),
    unit: optText(20),
    quality: z.number().int().min(1).max(5).nullish(),
    tags: z.string().max(500).default(''),
  })
  .refine((e) => e.body !== '' || e.amount != null, { message: 'Írj szöveget vagy adj meg mennyiséget', path: ['body'] });
export type JournalInput = z.input<typeof journalInput>;

/** Tervév: állapot és jegyzet. */
export const planYearInput = z.object({
  status: z.enum(PLAN_YEAR_STATUSES),
  notes: optText(4000),
});
export type PlanYearInput = z.infer<typeof planYearInput>;

/** Évelők átvitele az előző évből: az átvinni kívánt (előző évi) ültetések. */
export const carryOverInput = z.object({
  ids: z.array(z.number().int().positive()).max(500),
});
