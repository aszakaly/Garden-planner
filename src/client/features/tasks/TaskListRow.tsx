import { Fragment, type ReactNode } from 'react';
import type { PlantingIssue } from '@shared/domain/plantingChecks.ts';
import type { TaskItem } from '@shared/domain/tasks.ts';
import { Chip } from '../../components/ui/Chip.tsx';
import { TaskRow } from '../../components/ui/TaskRow.tsx';
import { formatShort, formatWeekday, todayISO } from '../../lib/format.ts';
import { isWarning } from '../plan/useChecks.ts';
import { CATEGORY_COLOR, isOverdue, taskColor } from './taskView.ts';
import { useToggleTask } from './useTaskActions.ts';
import s from './TaskListRow.module.css';

interface Props {
  task: TaskItem;
  /** A nap is kerüljön a másodlagos sorba ('weekday': a hét napjával együtt) */
  showDate?: boolean | 'weekday';
  /** Az ültetés ellenőrzési jelzései – vetésnél, kiültetésnél a figyelmeztetések megjelennek */
  issues?: PlantingIssue[];
  onOpen: (task: TaskItem) => void;
}

/** Egy feladat a listákban: pipáló, cím, nap, ágyás, részletek, típuscímke. */
export function TaskListRow({ task: t, showDate, issues = [], onOpen }: Props) {
  const toggle = useToggleTask();
  const color = taskColor(t);
  const today = todayISO();
  const done = t.done_on !== null;
  // Másik évre eső dátumnál az év is kell
  const short = (iso: string) => (iso.slice(0, 4) === t.date.slice(0, 4) ? formatShort(iso) : `${iso.slice(0, 4)}. ${formatShort(iso)}`);

  const warnings =
    !done && (t.category === 'vetes' || t.category === 'kiultetes')
      ? [...new Map(issues.filter((i) => isWarning(i) && i.chip).map((i) => [i.chip, i])).values()].slice(0, 2)
      : [];

  const parts: ReactNode[] = [];
  if (showDate) {
    const label = showDate === 'weekday' ? `${formatShort(t.date)}, ${formatWeekday(t.date)}` : formatShort(t.date);
    parts.push(<span className={isOverdue(t, today) ? s.overdue : undefined}>{label}</span>);
  }
  if (t.bed_name) {
    parts.push(
      <span className={s.bed} style={{ color }}>
        {t.bed_name}
      </span>,
    );
  }
  if (t.detail) parts.push(t.detail);
  if (!done && t.planned && t.planned !== t.date) {
    parts.push(<span className={s.shifted}>{t.moved_to ? 'áthelyezve' : 'csúszik'}, terv: {short(t.planned)}</span>);
  }
  if (done && t.done_on !== t.date) parts.push(`elvégezve: ${short(t.done_on!)}`);

  return (
    <TaskRow
      title={t.title}
      done={done}
      color={color}
      onToggle={(v) => toggle(t, v)}
      onInfo={() => onOpen(t)}
      meta={
        parts.length || t.note ? (
          <>
            {parts.map((p, i) => (
              <Fragment key={i}>
                {i > 0 && ' · '}
                {p}
              </Fragment>
            ))}
            {t.note && <span className={s.note}>{t.note}</span>}
          </>
        ) : undefined
      }
      chips={
        <>
          <Chip dot={CATEGORY_COLOR[t.category]}>{t.label}</Chip>
          {warnings.map((i) => (
            <Chip key={i.chip} tone={i.level === 'kerulendo' ? 'bad' : 'warn'}>
              {i.chip}
            </Chip>
          ))}
        </>
      }
    />
  );
}
