import { useNavigate } from 'react-router';
import { useState, type CSSProperties } from 'react';
import { SLOT_FIELD, type TaskItem } from '@shared/domain/tasks.ts';
import type { TaskStatePatch } from '@shared/schemas.ts';
import { DateInput, FormButton, FormGroup, FormRow, TextArea, Toggle } from '../../components/ui/Form.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { errorMessage } from '../../lib/errors.ts';
import { formatDay, formatWeekday, todayISO } from '../../lib/format.ts';
import { CATEGORY_COLOR, taskColor } from './taskView.ts';
import { useTaskPatch } from './useTaskActions.ts';
import s from './TaskSheets.module.css';

const DONE_HINT: Record<string, string> = {
  vetes: 'Az elvégzés napja az ültetés tényleges vetési (ültetési) dátuma lesz – a terv nem változik, a későbbi lépések vele csúsznak.',
  kiultetes: 'Az elvégzés napja az ültetés tényleges kiültetési dátuma lesz – a későbbi lépések vele csúsznak.',
  betakaritas: 'Az elvégzés napja a betakarítás tényleges kezdete lesz.',
  felszabadul: 'Az elvégzés napja a terület tényleges felszabadulása lesz, és az ültetés lezárul.',
};

interface Props {
  task: TaskItem;
  onClose: () => void;
  onOpenPlanting: (id: number) => void;
}

const dayText = (iso: string) => `${formatDay(iso)}, ${formatWeekday(iso)}`;

/** A tervből generált feladat részletei: elvégzés (visszamenőleg is), áthelyezés, megjegyzés. */
export function TaskDetailSheet({ task: t, onClose, onOpenPlanting }: Props) {
  const navigate = useNavigate();
  const save = useTaskPatch();
  const [done, setDone] = useState(t.done_on !== null);
  const [doneOn, setDoneOn] = useState(t.done_on ?? todayISO());
  const [movedTo, setMovedTo] = useState(t.moved_to);
  const [note, setNote] = useState(t.note ?? '');
  const field = t.slot !== 'sajat' ? SLOT_FIELD[t.slot] : undefined;

  function confirm() {
    const patch: TaskStatePatch = {};
    const nextDone = done ? doneOn : null;
    if (nextDone !== t.done_on) patch.done_on = nextDone;
    if (movedTo !== t.moved_to) patch.moved_to = movedTo;
    if ((note.trim() || null) !== t.note) patch.note = note.trim() || null;
    if (!Object.keys(patch).length) return onClose();
    save.mutate({ key: t.key, patch }, { onSuccess: onClose });
  }

  return (
    <Sheet
      title="Feladat"
      open
      onClose={onClose}
      onConfirm={confirm}
      confirmDisabled={done && !doneOn}
      busy={save.isPending}
      error={errorMessage(save.error)}
    >
      <div className={s.head} style={{ '--c': taskColor(t) } as CSSProperties}>
        <span className={s.kind} style={{ '--k': CATEGORY_COLOR[t.category] } as CSSProperties}>
          {t.label}
        </span>
        <h3 className={s.title}>{t.title}</h3>
        <p className={s.sub}>
          {t.bed_name && <span className={s.bed}>{t.bed_name}</span>}
          {t.bed_name && t.detail && ' · '}
          {t.detail}
        </p>
      </div>

      <FormGroup
        title="Időpont"
        footer={
          done
            ? undefined
            : field
              ? 'Áthelyezéskor a későbbi lépések is ugyanennyivel csúsznak; a terv nem változik.'
              : 'Az áthelyezés csak ezt a feladatot érinti.'
        }
      >
        {t.planned && (
          <FormRow label="Terv szerint">
            <span className={s.value}>{dayText(t.planned)}</span>
          </FormRow>
        )}
        {!t.planned && (
          <FormRow label="Várható nap">
            <span className={s.value}>{dayText(t.date)}</span>
          </FormRow>
        )}
        {!done && (
          <FormRow label="Áthelyezve">
            <DateInput value={movedTo} onChange={setMovedTo} aria-label="Áthelyezés napja" />
          </FormRow>
        )}
      </FormGroup>

      <FormGroup title="Elvégzés" footer={field ? DONE_HINT[t.slot] : undefined}>
        <FormRow label="Elvégezve">
          <Toggle checked={done} onChange={setDone} label="Elvégezve" />
        </FormRow>
        {done && (
          <FormRow label="Napja">
            <DateInput value={doneOn} onChange={(v) => setDoneOn(v ?? '')} max={todayISO()} aria-label="Az elvégzés napja" />
          </FormRow>
        )}
      </FormGroup>

      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="pl. eső miatt halasztva" />
        </FormRow>
      </FormGroup>

      <FormGroup>
        {t.planting_id && (
          <FormButton onClick={() => onOpenPlanting(t.planting_id!)}>
            {t.planting_ids.length > 1 ? 'Az első ültetés megnyitása' : 'Ültetés megnyitása'}
          </FormButton>
        )}
        {t.category === 'beszerzes' && t.slot === 'beszerzes' && (
          <FormButton onClick={() => navigate('/vetomag')}>Vetőmagkészlet</FormButton>
        )}
      </FormGroup>
    </Sheet>
  );
}
