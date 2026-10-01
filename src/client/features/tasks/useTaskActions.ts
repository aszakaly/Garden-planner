import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskItem } from '@shared/domain/tasks.ts';
import type { TaskStatePatch } from '@shared/schemas.ts';
import { api } from '../../lib/api.ts';
import { todayISO } from '../../lib/format.ts';
import { qk } from '../../lib/queries.ts';

const patchTask = (key: string, patch: TaskStatePatch) => api.patch(`/tasks/${encodeURIComponent(key)}`, patch);

/**
 * Feladat állapotának módosítása (elvégzés, áthelyezés, megjegyzés). Az elvégzés azonnal
 * látszik a listákban; utána a feladatok és az ültetések (tény dátumok, státusz) frissülnek.
 */
export function useTaskPatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: TaskStatePatch }) => patchTask(key, patch),
    onMutate: async ({ key, patch }) => {
      if (patch.done_on === undefined) return;
      await client.cancelQueries({ queryKey: qk.tasks });
      client.setQueriesData<TaskItem[]>({ queryKey: qk.tasks }, (old) =>
        old?.map((t) => (t.key === key ? { ...t, done_on: patch.done_on ?? null } : t)),
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: qk.plantings }),
  });
}

/** Pipálás: elvégezve ma (a dátum a részleteknél módosítható), illetve visszavonás. */
export function useToggleTask() {
  const mutation = useTaskPatch();
  return (task: TaskItem, done: boolean) => mutation.mutate({ key: task.key, patch: { done_on: done ? todayISO() : null } });
}
