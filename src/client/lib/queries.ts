import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './api.ts';
import type { Settings } from '@shared/settings.ts';
import type { CompanionPair } from '@shared/domain/companions.ts';
import { ROTATION_LOOKBACK_YEARS } from '@shared/domain/rotation.ts';
import type { PlanYear } from '@shared/domain/planYear.ts';
import type { TaskItem } from '@shared/domain/tasks.ts';
import type { JournalType } from '@shared/labels.ts';
import type {
  Bed,
  BedListItem,
  CropGroup,
  Garden,
  JournalEntry,
  PlantDetail,
  PlantFamily,
  PlantListItem,
  PlantingListItem,
  SeedStockListItem,
  VarietyListItem,
} from '@shared/types.ts';

/** Magyar ábécé szerinti rendezés (az SQLite NOCASE nem ismeri az ékezetes betűk helyét). */
const collator = new Intl.Collator('hu', { sensitivity: 'base', numeric: true });
const byName = <T extends { name_hu: string }>(items: T[]) => [...items].sort((a, b) => collator.compare(a.name_hu, b.name_hu));

export const qk = {
  settings: ['settings'] as const,
  plants: ['plants'] as const,
  plant: (id: number) => ['plants', id] as const,
  families: ['families'] as const,
  cropGroups: ['crop-groups'] as const,
  varieties: ['varieties'] as const,
  seeds: ['seeds'] as const,
  gardens: ['gardens'] as const,
  beds: ['beds'] as const,
  bedList: (year: number, activeOnly: boolean) => ['beds', 'list', year, activeOnly] as const,
  bed: (id: number) => ['beds', id] as const,
  plantings: ['plantings'] as const,
  plantingList: (year: number) => ['plantings', year] as const,
  plantingHistory: (year: number) => ['plantings', 'elozmeny', year] as const,
  companions: ['companions'] as const,
  /** A feladatok az ültetésekből készülnek: az ültetések érvénytelenítése a feladatokat is frissíti */
  tasks: ['plantings', 'tasks'] as const,
  taskRange: (from: string, to: string) => ['plantings', 'tasks', from, to] as const,
  planting: (id: number) => ['plantings', 'egy', id] as const,
  cultivation: (kind: 'noveny' | 'fajta', id: number) => ['plantings', 'tortenet', kind, id] as const,
  /** Az előző évből áthozható évelők (az ültetésekkel együtt frissül) */
  carryover: (year: number) => ['plantings', 'atvitel', year] as const,
  planYear: (year: number) => ['plan-years', year] as const,
  backups: ['backups'] as const,
  journal: ['journal'] as const,
  journalList: (filter: JournalFilter) => ['journal', 'lista', filter] as const,
  journalCount: (year: number) => ['journal', 'db', year] as const,
};

/** Naplószűrő (a lekérdezés paraméterei). */
export interface JournalFilter {
  q?: string;
  type?: JournalType;
  planting_id?: number;
  plant_id?: number;
  variety_id?: number;
  bed_id?: number;
  year?: number;
  from?: string;
  to?: string;
}

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => api.get<Settings>('/settings') });
export const usePlants = () =>
  useQuery({ queryKey: qk.plants, queryFn: () => api.get<PlantListItem[]>('/plants'), select: byName });
export const usePlantDetail = (id: number) =>
  useQuery({ queryKey: qk.plant(id), queryFn: () => api.get<PlantDetail>(`/plants/${id}`), enabled: id > 0 });
export const useFamilies = () =>
  useQuery({ queryKey: qk.families, queryFn: () => api.get<PlantFamily[]>('/families'), select: byName });
export const useCropGroups = () =>
  useQuery({ queryKey: qk.cropGroups, queryFn: () => api.get<CropGroup[]>('/crop-groups') });
export const useVarieties = () =>
  useQuery({ queryKey: qk.varieties, queryFn: () => api.get<VarietyListItem[]>('/varieties') });

export const useSeeds = () => useQuery({ queryKey: qk.seeds, queryFn: () => api.get<SeedStockListItem[]>('/seeds') });
export const useGardens = () => useQuery({ queryKey: qk.gardens, queryFn: () => api.get<Garden[]>('/gardens') });
export const useBeds = (year: number, activeOnly = false) =>
  useQuery({
    queryKey: qk.bedList(year, activeOnly),
    queryFn: () => api.get<BedListItem[]>(`/beds?year=${year}${activeOnly ? '&active=1' : ''}`),
  });
export const useBed = (id: number) =>
  useQuery({ queryKey: qk.bed(id), queryFn: () => api.get<Bed>(`/beds/${id}`), enabled: id > 0 });

export const usePlantings = (year: number) =>
  useQuery({
    queryKey: qk.plantingList(year),
    queryFn: () => api.get<PlantingListItem[]>(`/plantings?year=${year}`),
  });

/** Az év és a megelőző évek ültetései (vetésforgó-előzményekhez). */
export const usePlantingHistory = (year: number) =>
  useQuery({
    queryKey: qk.plantingHistory(year),
    queryFn: () => api.get<PlantingListItem[]>(`/plantings?year=${year}&from_year=${year - ROTATION_LOOKBACK_YEARS}`),
  });

export const usePlanting = (id: number | null) =>
  useQuery({
    queryKey: qk.planting(id ?? 0),
    queryFn: () => api.get<PlantingListItem>(`/plantings/${id}`),
    enabled: !!id && id > 0,
  });

/** A két nap közé eső feladatok (generált és saját). */
export const useTasks = (from: string, to: string) =>
  useQuery({ queryKey: qk.taskRange(from, to), queryFn: () => api.get<TaskItem[]>(`/tasks?from=${from}&to=${to}`) });

/** Egy növény vagy fajta összes ültetése minden évből (tudásbázis). */
export const useCultivation = (by: { plantId: number } | { varietyId: number }) => {
  const [kind, id] = 'plantId' in by ? (['noveny', by.plantId] as const) : (['fajta', by.varietyId] as const);
  return useQuery({
    queryKey: qk.cultivation(kind, id),
    queryFn: () => api.get<PlantingListItem[]>(`/plantings/history?${kind === 'noveny' ? 'plant_id' : 'variety_id'}=${id}`),
    enabled: id > 0,
  });
};

export const useJournal = (filter: JournalFilter, enabled = true) =>
  useQuery({
    queryKey: qk.journalList(filter),
    queryFn: () => {
      const params = new URLSearchParams(
        Object.entries(filter).flatMap(([k, v]) => (v === undefined || v === '' ? [] : [[k, String(v)]])),
      );
      return api.get<JournalEntry[]>(`/journal?${params}`);
    },
    enabled,
  });

export const useJournalCount = (year: number) =>
  useQuery({ queryKey: qk.journalCount(year), queryFn: () => api.get<{ count: number }>(`/journal/count?year=${year}`) });

export const usePlanYear = (year: number) =>
  useQuery({ queryKey: qk.planYear(year), queryFn: () => api.get<PlanYear>(`/plan-years/${year}`) });

export const useCarryCandidates = (year: number) =>
  useQuery({ queryKey: qk.carryover(year), queryFn: () => api.get<PlantingListItem[]>(`/plan-years/${year}/carryover`) });

/** A mentések listája (a legújabbal kezdve) és a helyük. */
export interface BackupList {
  dir: string | null;
  files: { name: string; size: number; created: string }[];
}
export const useBackups = () => useQuery({ queryKey: qk.backups, queryFn: () => api.get<BackupList>('/backups') });

export const useCompanions = () =>
  useQuery({ queryKey: qk.companions, queryFn: () => api.get<CompanionPair[]>('/companions'), staleTime: Infinity });

/** Mutáció, ami siker után a megadott lekérdezéseket érvényteleníti. */
export function useApiMutation<TInput, TResult = unknown>(
  fn: (input: TInput) => Promise<TResult>,
  invalidate: QueryKey[],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(invalidate.map((key) => client.invalidateQueries({ queryKey: key }))),
  });
}
