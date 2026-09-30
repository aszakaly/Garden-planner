import type {
  BedType,
  DataStatus,
  ListColorName,
  NutrientGroup,
  RotationStage,
  RowDirection,
  Season,
  SeedOrigin,
  Sun,
  WindowMethod,
} from './labels.ts';
import type { SeedViability } from './domain/seeds.ts';

export interface SeedStock {
  id: number;
  variety_id: number;
  supplier: string | null;
  origin_type: SeedOrigin;
  vintage_year: number | null;
  in_stock: boolean;
  quantity: string | null;
  notes: string | null;
}

export interface SeedStockListItem extends SeedStock {
  variety_name: string;
  plant_id: number;
  plant_name: string;
  seed_viability_years: number | null;
  /** Csírázóképesség az aktuális évben */
  viability: SeedViability;
}

export interface Garden {
  id: number;
  name: string;
  location: string | null;
  notes: string | null;
}

export interface Bed {
  id: number;
  garden_id: number;
  name: string;
  color: ListColorName;
  length_cm: number;
  width_cm: number;
  row_direction: RowDirection;
  pos_x_cm: number | null;
  pos_y_cm: number | null;
  rotation_deg: number;
  bed_type: BedType;
  sun: Sun | null;
  soil: string | null;
  irrigation: string | null;
  notes: string | null;
  active_from_year: number | null;
  active_to_year: number | null;
  sort_order: number;
}

export interface BedListItem extends Bed {
  /** Az adott év ültetéseinek száma */
  planting_count: number;
  /** Az adott évben használatban van-e */
  active: boolean;
}

export interface PlantFamily {
  id: number;
  code: string;
  name_hu: string;
  name_latin: string | null;
  rotation_gap_years: number;
  notes: string | null;
  plant_count?: number;
}

export interface CropGroup {
  id: number;
  code: string;
  name_hu: string;
  description: string | null;
  rotation_stage: RotationStage | null;
  sort_order: number;
  plant_count?: number;
}

export interface GrowingWindow {
  id: number;
  plant_id: number | null;
  variety_id: number | null;
  season: Season;
  method: WindowMethod;
  sow_start: string | null;
  sow_end: string | null;
  seedling_weeks: number | null;
  transplant_start: string | null;
  transplant_end: string | null;
  harvest_start: string | null;
  harvest_end: string | null;
  harvest_year_offset: 0 | 1;
  succession_days: number | null;
  notes: string | null;
}

export interface Plant {
  id: number;
  code: string | null;
  name_hu: string;
  name_latin: string | null;
  family_id: number | null;
  crop_group_id: number | null;
  rotation_stage: RotationStage | null;
  nutrient_group: NutrientGroup | null;
  perennial: boolean;
  frost_sensitive: boolean;
  in_row_spacing_cm: number | null;
  row_spacing_cm: number | null;
  days_to_harvest: number | null;
  harvest_duration_days: number | null;
  seed_viability_years: number | null;
  sun: Sun | null;
  aliases_en: string[];
  notes: string | null;
  data_status: DataStatus;
  source: string | null;
}

export interface PlantListItem extends Plant {
  family_name: string | null;
  crop_group_name: string | null;
  variety_count: number;
  windows: GrowingWindow[];
}

export interface Variety {
  id: number;
  plant_id: number;
  name: string;
  description: string | null;
  days_to_harvest: number | null;
  in_row_spacing_cm: number | null;
  row_spacing_cm: number | null;
  notes: string | null;
}

export interface VarietyWithWindows extends Variety {
  windows: GrowingWindow[];
  /** Készleten lévő vetőmagtételek száma és a legfrissebb évjárat */
  stock_count: number;
  latest_vintage: number | null;
}

export interface VarietyListItem extends Variety {
  plant_name: string;
}

export interface CompanionView {
  id: number;
  other_plant_id: number;
  other_plant_name: string;
  relation: -1 | 0 | 1;
  reason: string | null;
  source: string;
  evidence: { kedvezo?: number; kerulendo?: number; eredeti?: string | null } | null;
}

export interface PlantDetail {
  plant: Plant;
  family: PlantFamily | null;
  crop_group: CropGroup | null;
  windows: GrowingWindow[];
  varieties: VarietyWithWindows[];
  companions: CompanionView[];
}
