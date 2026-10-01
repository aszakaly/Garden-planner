import { useState, type ReactNode } from 'react';
import type { TaskItem } from '@shared/domain/tasks.ts';
import { usePlanting } from '../../lib/queries.ts';
import { PlantingEditSheet } from '../plan/PlantingEditSheet.tsx';
import { CustomTaskSheet } from './CustomTaskSheet.tsx';
import { TaskDetailSheet } from './TaskDetailSheet.tsx';

export interface TaskSheets {
  /** Feladat részleteinek megnyitása (generált vagy saját) */
  open: (task: TaskItem) => void;
  /** Új saját feladat a megadott napra */
  create: (date: string, bedId?: number | null) => void;
  sheets: ReactNode;
}

/** A feladatlisták közös lapjai: részletek, saját feladat, a kapcsolódó ültetés szerkesztője. */
export function useTaskSheets(): TaskSheets {
  const [task, setTask] = useState<TaskItem | null>(null);
  const [draft, setDraft] = useState<{ date: string; bedId?: number | null } | null>(null);
  const [plantingId, setPlantingId] = useState<number | null>(null);
  const { data: planting } = usePlanting(plantingId);

  const sheets = (
    <>
      {task && task.slot !== 'sajat' && (
        <TaskDetailSheet
          key={task.key}
          task={task}
          onClose={() => setTask(null)}
          onOpenPlanting={(id) => {
            setTask(null);
            setPlantingId(id);
          }}
        />
      )}
      {task?.slot === 'sajat' && <CustomTaskSheet key={task.key} task={task} onClose={() => setTask(null)} />}
      {draft && <CustomTaskSheet date={draft.date} bedId={draft.bedId} onClose={() => setDraft(null)} />}
      <PlantingEditSheet
        open={plantingId !== null && planting?.id === plantingId}
        onClose={() => setPlantingId(null)}
        planting={planting}
        year={planting?.year ?? new Date().getFullYear()}
      />
    </>
  );

  return { open: setTask, create: (date, bedId) => setDraft({ date, bedId }), sheets };
}
