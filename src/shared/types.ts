import type { DataStatus, NutrientGroup, RotationStage, Season, Sun, WindowMethod } from './labels.ts';

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
