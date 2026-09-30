/** Kódolt értékek és magyar feliratuk – a felület és a szerver közösen használja. */

export const ROTATION_STAGES = ['huvelyes', 'level', 'termes', 'gyoker'] as const;
export type RotationStage = (typeof ROTATION_STAGES)[number];
export const ROTATION_STAGE_LABEL: Record<RotationStage, string> = {
  huvelyes: 'Hüvelyes',
  level: 'Levél',
  termes: 'Termés',
  gyoker: 'Gyökér',
};

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

export const MONTHS_HU = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
] as const;
export const MONTHS_SHORT_HU = ['jan', 'feb', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec'] as const;
