import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '../components/ui/Chip.tsx';
import { PageHeader, ToolbarButton } from '../components/ui/PageHeader.tsx';
import { Section } from '../components/ui/Section.tsx';
import { TaskRow } from '../components/ui/TaskRow.tsx';
import { colorVar } from '../lib/colors.ts';
import { formatDay, formatShort, formatWeekday, relativeDayLabel, todayISO } from '../lib/format.ts';
import { MOCK_BEDS, MOCK_TASKS, type MockTask } from '../mock/checkpoint.ts';
import s from './ThisWeekPage.module.css';

export function ThisWeekPage() {
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MOCK_TASKS.map((t) => [t.id, !!t.done])),
  );
  const today = todayISO();
  const overdue = MOCK_TASKS.filter((t) => t.date < today);
  const upcoming = MOCK_TASKS.filter((t) => t.date >= today);
  const byDay = Map.groupBy(upcoming, (t) => t.date);
  const open = MOCK_TASKS.filter((t) => !done[t.id]).length;

  const row = (task: MockTask, showDate = false) => {
    const bed = MOCK_BEDS.find((b) => b.id === task.bedId);
    const color = bed ? colorVar(bed.color) : 'var(--c-blue)';
    return (
      <TaskRow
        key={task.id}
        title={task.title}
        done={!!done[task.id]}
        color={color}
        onToggle={(v) => setDone((d) => ({ ...d, [task.id]: v }))}
        onInfo={() => {}}
        meta={
          <>
            {showDate && <span className={s.overdue}>{formatShort(task.date)} · </span>}
            {bed && (
              <span className={s.bed} style={{ color }}>
                {bed.name}
              </span>
            )}
            {bed && ' · '}
            {task.detail}
          </>
        }
        chips={
          <>
            <Chip dot={color}>{task.kind}</Chip>
            {task.chips?.map((c) => (
              <Chip key={c.text} tone={c.tone}>
                {c.text}
              </Chip>
            ))}
          </>
        }
      />
    );
  };

  return (
    <div className={s.page}>
      <PageHeader
        title="Ez a hét"
        color="var(--c-blue)"
        count={open}
        actions={
          <ToolbarButton label="Új feladat">
            <Plus size={19} strokeWidth={2.2} />
          </ToolbarButton>
        }
      />

      {overdue.length > 0 && (
        <Section title="Lejárt" tone="danger">
          {overdue.map((t) => row(t, true))}
        </Section>
      )}

      {[...byDay.entries()].map(([date, tasks]) => {
        const label = relativeDayLabel(date, today);
        const isRelative = ['Ma', 'Holnap', 'Tegnap'].includes(label);
        return (
        <Section key={date} title={label} detail={isRelative ? `${formatDay(date)}, ${formatWeekday(date)}` : formatDay(date)}>
          {tasks.map((t) => row(t))}
        </Section>
        );
      })}
    </div>
  );
}
