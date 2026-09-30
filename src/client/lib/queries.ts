import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './api.ts';
import type { Settings } from '@shared/settings.ts';
import type { CropGroup, PlantDetail, PlantFamily, PlantListItem, VarietyListItem } from '@shared/types.ts';

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
};

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
