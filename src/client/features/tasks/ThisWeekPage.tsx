import { Eye, EyeOff, ListTodo, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { formatDay, formatWeekday, relativeDayLabel, todayISO } from '../../lib/format.ts';
import { useTasks } from '../../lib/queries.ts';
import { useStoredState } from '../../lib/useStoredState.ts';
import { useYearChecks } from '../plan/useChecks.ts';
import { TaskListRow } from './TaskListRow.tsx';
import { isDone, weekRange } from './taskView.ts';
import { useTaskSheets } from './useTaskSheets.tsx';
import s from './TaskPages.module.css';

/** A mai naptól hét nap teendői, előtte a lejárt (el nem végzett) feladatok. */
export function ThisWeekPage() {
  const today = todayISO();
  const range = weekRange(today);
  const { data: tasks, isLoading } = useTasks(range.from, range.to);
  const [showDone, setShowDone] = useStoredState('kerttervezo.showDone', true);
  const checks = useYearChecks(Number(today.slice(0, 4)));
  const sheets = useTaskSheets();

  const all = tasks ?? [];
  // A ma elvégzett lejárt feladat a helyén marad (áthúzva), hogy a pipálás ne ugrassa el
  const overdue = all.filter((t) => t.date < today && (!isDone(t) || (showDone && t.done_on === today)));
  const upcoming = all.filter((t) => t.date >= today && (showDone || !isDone(t)));
  const byDay = Map.groupBy(upcoming, (t) => t.date);
  const open = all.filter((t) => !isDone(t)).length;
  const doneCount = all.filter((t) => t.date >= today && isDone(t)).length;

  const row = (t: (typeof all)[number], showDate = false) => (
    <TaskListRow key={t.key} task={t} showDate={showDate} issues={checks.byPlanting.get(t.planting_id ?? -1)} onOpen={sheets.open} />
  );

  return (
    <div className={s.page}>
      <PageHeader
        title="Ez a hét"
        color="var(--c-blue)"
        count={open}
        actions={
          <>
            <ToolbarButton label={showDone ? 'Elvégzettek elrejtése' : 'Elvégzettek mutatása'} onClick={() => setShowDone(!showDone)}>
              {showDone ? <EyeOff size={19} strokeWidth={2.2} /> : <Eye size={19} strokeWidth={2.2} />}
            </ToolbarButton>
            <ToolbarButton label="Új feladat" onClick={() => sheets.create(today)}>
              <Plus size={19} strokeWidth={2.2} />
            </ToolbarButton>
          </>
        }
      />

      {!showDone && doneCount > 0 && (
        <p className={s.doneNote}>
          {doneCount} elvégzett feladat rejtve ·{' '}
          <button type="button" onClick={() => setShowDone(true)}>
            Mutasd
          </button>
        </p>
      )}

      {overdue.length > 0 && (
        <Section title="Lejárt" tone="danger">
          {overdue.map((t) => row(t, true))}
        </Section>
      )}

      {[...byDay.entries()].map(([date, items]) => {
        const label = relativeDayLabel(date, today);
        const relative = ['Ma', 'Holnap'].includes(label);
        return (
          <Section key={date} title={label} detail={relative ? `${formatDay(date)}, ${formatWeekday(date)}` : formatDay(date)}>
            {items.map((t) => row(t))}
          </Section>
        );
      })}

      {!isLoading && overdue.length === 0 && upcoming.length === 0 && (
        <div className={s.empty} style={{ '--c': 'var(--c-blue)' } as CSSProperties}>
          <ListTodo size={44} strokeWidth={1.8} className={s.emptyIcon} />
          <p className={s.emptyTitle}>Ezen a héten nincs teendő</p>
          <p>
            A feladatok az éves terv ültetéseiből készülnek: vetőmag-beszerzés, vetés, palántanevelés, kiültetés,
            betakarítás. Saját teendőt is felvehetsz.
          </p>
          <button type="button" className={s.emptyButton} onClick={() => sheets.create(today)}>
            <Plus size={16} strokeWidth={2.6} />
            Új feladat
          </button>
        </div>
      )}

      {sheets.sheets}
    </div>
  );
}
