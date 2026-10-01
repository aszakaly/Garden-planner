import { useState, type ReactNode } from 'react';
import type { TaskItem } from '@shared/domain/tasks.ts';
import { todayISO } from '../../lib/format.ts';
import { usePlanting } from '../../lib/queries.ts';
import { useJournalSheet } from '../journal/useJournalSheet.tsx';
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
  const journal = useJournalSheet();

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
          onJournal={(t) => {
            setTask(null);
            journal.create({
              planting_id: t.planting_id,
              entry_type: t.slot === 'betakaritas' ? 'termes' : 'megfigyeles',
              entry_date: t.done_on ?? (t.date <= todayISO() ? t.date : todayISO()),
            });
          }}
        />
      )}
      {task?.slot === 'sajat' && <CustomTaskSheet key={task.key} task={task} onClose={() => setTask(null)} />}
      {draft && <CustomTaskSheet date={draft.date} bedId={draft.bedId} onClose={() => setDraft(null)} />}
      {journal.sheet}
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
