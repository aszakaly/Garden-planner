import { useState } from 'react';
import type { TaskItem } from '@shared/domain/tasks.ts';
import type { CustomTaskInput } from '@shared/schemas.ts';
import { DateInput, FormButton, FormGroup, FormRow, Select, TextArea, TextInput, Toggle } from '../../components/ui/Form.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { todayISO } from '../../lib/format.ts';
import { qk, useApiMutation, useBeds } from '../../lib/queries.ts';

interface Props {
  /** Meglévő saját feladat; ha nincs, új feladat készül */
  task?: TaskItem;
  /** Új feladat napja */
  date?: string;
  /** Új feladat előre kiválasztott ágyása */
  bedId?: number | null;
  onClose: () => void;
}

/** Saját feladat felvétele és szerkesztése (cím, nap, ágyás, megjegyzés, elvégzés). */
export function CustomTaskSheet({ task, date, bedId, onClose }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [due, setDue] = useState<string | null>(task?.date ?? date ?? todayISO());
  const [bed, setBed] = useState<number | null>(task?.bed_id ?? bedId ?? null);
  const [notes, setNotes] = useState(task?.note ?? '');
  const [done, setDone] = useState(!!task?.done_on);
  const [doneOn, setDoneOn] = useState<string | null>(task?.done_on ?? todayISO());
  const { data: beds = [] } = useBeds(Number((due ?? todayISO()).slice(0, 4)));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useApiMutation(() => {
    const body: CustomTaskInput = {
      title,
      due_date: due!,
      bed_id: bed,
      planting_id: task?.planting_id ?? null,
      notes,
      done_at: done ? doneOn : null,
    };
    return task ? api.put(`/custom-tasks/${task.custom_id}`, body) : api.post('/custom-tasks', body);
  }, [qk.tasks]);
  const remove = useApiMutation(() => api.delete(`/custom-tasks/${task!.custom_id}`), [qk.tasks]);

  return (
    <Sheet
      title={task ? 'Saját feladat' : 'Új feladat'}
      open
      onClose={onClose}
      onConfirm={() => save.mutate(undefined, { onSuccess: onClose })}
      confirmLabel={task ? 'Kész' : 'Hozzáadás'}
      confirmDisabled={!title.trim() || !due || (done && !doneOn)}
      busy={save.isPending || remove.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <FormGroup>
        <FormRow label="Feladat" stacked hideLabel>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="pl. Komposzt átforgatása" maxLength={200} />
        </FormRow>
        <FormRow label="Nap">
          <DateInput value={due} onChange={setDue} required />
        </FormRow>
        <FormRow label="Ágyás">
          <Select value={bed ?? ''} onChange={(e) => setBed(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Nincs</option>
            {beds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormRow>
      </FormGroup>

      {task && (
        <FormGroup>
          <FormRow label="Elvégezve">
            <Toggle checked={done} onChange={setDone} label="Elvégezve" />
          </FormRow>
          {done && (
            <FormRow label="Napja">
              <DateInput value={doneOn} onChange={setDoneOn} max={todayISO()} aria-label="Az elvégzés napja" />
            </FormRow>
          )}
        </FormGroup>
      )}

      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormRow>
      </FormGroup>

      {task && (
        <FormGroup>
          {confirmDelete ? (
            <FormButton destructive onClick={() => remove.mutate(undefined, { onSuccess: onClose })}>
              Biztosan törlöd?
            </FormButton>
          ) : (
            <FormButton destructive onClick={() => setConfirmDelete(true)}>
              Feladat törlése
            </FormButton>
          )}
        </FormGroup>
      )}
    </Sheet>
  );
}
