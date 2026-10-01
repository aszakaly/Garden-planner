/** Kódolt értékek és magyar feliratuk – a felület és a szerver közösen használja. */

export const ROTATION_STAGES = ['huvelyes', 'level', 'termes', 'gyoker'] as const;
export type RotationStage = (typeof ROTATION_STAGES)[number];
export const ROTATION_STAGE_LABEL: Record<RotationStage, string> = {
  huvelyes: 'Hüvelyes',
  level: 'Levél',
  termes: 'Termés',
  gyoker: 'Gyökér',
};
/** Mondatba illő alak: „termés után gyökérzöldség következik” */
export const ROTATION_STAGE_NOUN: Record<RotationStage, string> = {
  huvelyes: 'hüvelyes',
  level: 'levélzöldség',
  termes: 'természöldség',
  gyoker: 'gyökérzöldség',
};
/** A klasszikus négyes forgó: hüvelyes → levél → termés → gyökér → hüvelyes … */
export const nextRotationStage = (s: RotationStage): RotationStage =>
  ROTATION_STAGES[(ROTATION_STAGES.indexOf(s) + 1) % ROTATION_STAGES.length]!;

export const SEASONS = ['tavaszi', 'nyari', 'oszi', 'attelelo'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_LABEL: Record<Season, string> = {
  tavaszi: 'Tavaszi',
  nyari: 'Nyári',
  oszi: 'Őszi',
  attelelo: 'Áttelelő',
};

export const WINDOW_METHODS = ['helyrevetes', 'palanta', 'ultetes'] as const;
export type WindowMethod = (typeof WINDOW_METHODS)[number];
export const WINDOW_METHOD_LABEL: Record<WindowMethod, string> = {
  helyrevetes: 'Helyrevetés',
  palanta: 'Palántáról',
  ultetes: 'Ültetés (gumó, hagyma, tő)',
};

/** Az ültetés módja (a palántás időszakból saját vagy vásárolt palánta is lehet). */
export const PLANTING_METHODS = ['helyrevetes', 'palanta', 'vasarolt_palanta', 'ultetes'] as const;
export type PlantingMethod = (typeof PLANTING_METHODS)[number];
export const PLANTING_METHOD_LABEL: Record<PlantingMethod, string> = {
  helyrevetes: 'Helyrevetés',
  palanta: 'Saját palánta',
  vasarolt_palanta: 'Vásárolt palánta',
  ultetes: 'Ültetés',
};

export const PLANTING_STATUSES = ['terv', 'folyamatban', 'lezart', 'elmaradt', 'sikertelen'] as const;
export type PlantingStatus = (typeof PLANTING_STATUSES)[number];
export const PLANTING_STATUS_LABEL: Record<PlantingStatus, string> = {
  terv: 'Tervezett',
  folyamatban: 'Folyamatban',
  lezart: 'Lezárva',
  elmaradt: 'Elmaradt',
  sikertelen: 'Sikertelen',
};

/** Ellenőrzések súlyossága: tájékoztató, figyelmeztetés, kerülendő / hibás. */
export type CheckLevel = 'info' | 'figyelem' | 'kerulendo';

export const NUTRIENT_GROUPS = [1, 2, 3] as const;
export type NutrientGroup = (typeof NUTRIENT_GROUPS)[number];
export const NUTRIENT_LABEL: Record<NutrientGroup, string> = {
  1: 'I. – erős tápanyagigény',
  2: 'II. – közepes tápanyagigény',
  3: 'III. – gyenge igény / talajjavító',
};
export const NUTRIENT_SHORT: Record<NutrientGroup, string> = { 1: 'Erős', 2: 'Közepes', 3: 'Gyenge' };

export const SUN_VALUES = ['napos', 'felarnyek', 'arnyek'] as const;
export type Sun = (typeof SUN_VALUES)[number];
export const SUN_LABEL: Record<Sun, string> = { napos: 'Napos', felarnyek: 'Félárnyék', arnyek: 'Árnyék' };

export const DATA_STATUS = ['alapertek', 'ellenorzott', 'sajat'] as const;
export type DataStatus = (typeof DATA_STATUS)[number];
export const DATA_STATUS_LABEL: Record<DataStatus, string> = {
  alapertek: 'Alapérték – ellenőrizendő',
  ellenorzott: 'Ellenőrizve',
  sajat: 'Saját adat',
};

export const RELATION_LABEL: Record<-1 | 0 | 1, string> = { 1: 'Kedvező', 0: 'Semleges', [-1]: 'Kerülendő' };

export const SEED_ORIGINS = ['vasarolt', 'sajat', 'csere'] as const;
export type SeedOrigin = (typeof SEED_ORIGINS)[number];
export const SEED_ORIGIN_LABEL: Record<SeedOrigin, string> = {
  vasarolt: 'Vásárolt',
  sajat: 'Saját fogású',
  csere: 'Csere / ajándék',
};

export const BED_TYPES = ['foldagyas', 'emelt', 'magasagyas', 'folia', 'uveghaz', 'cserep'] as const;
export type BedType = (typeof BED_TYPES)[number];
export const BED_TYPE_LABEL: Record<BedType, string> = {
  foldagyas: 'Földágyás',
  emelt: 'Emelt ágyás',
  magasagyas: 'Magaságyás',
  folia: 'Fóliasátor',
  uveghaz: 'Üvegház',
  cserep: 'Cserép / láda',
};
export const BED_TYPE_DESCRIPTION: Record<BedType, string> = {
  foldagyas: 'Keret nélküli ágyás a talajszinten.',
  emelt: 'Alacsony, kb. 15–20 cm magas kerettel.',
  magasagyas: '45 cm-nél magasabb kerettel – gyorsabban melegszik, de hamarabb ki is szárad.',
  folia: 'Fóliával fedett termesztőtér – korábbi vetés, hosszabb szezon.',
  uveghaz: 'Üveggel fedett termesztőtér.',
  cserep: 'Mozgatható edény, láda vagy dézsa.',
};

export const ROW_DIRECTIONS = ['keresztben', 'hosszaban'] as const;
export type RowDirection = (typeof ROW_DIRECTIONS)[number];
export const ROW_DIRECTION_LABEL: Record<RowDirection, string> = {
  keresztben: 'Keresztben',
  hosszaban: 'Hosszában',
};

/** Az ágyásokhoz választható színek (Apple rendszerszínek nevei). */
export const LIST_COLOR_NAMES = [
  'red', 'orange', 'yellow', 'green', 'mint', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'brown', 'gray',
] as const;
export type ListColorName = (typeof LIST_COLOR_NAMES)[number];

export const MONTHS_HU = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
] as const;
export const MONTHS_SHORT_HU = ['jan', 'feb', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec'] as const;
