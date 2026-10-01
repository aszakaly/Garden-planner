import { CalendarClock, Eye, EyeOff, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { MONTHS_HU } from '@shared/labels.ts';
import { capitalize } from '@shared/text.ts';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { todayISO } from '../../lib/format.ts';
import { useTasks } from '../../lib/queries.ts';
import { useStoredState } from '../../lib/useStoredState.ts';
import { useYear } from '../../lib/year.tsx';
import { useYearChecks } from '../plan/useChecks.ts';
import { TaskListRow } from './TaskListRow.tsx';
import { isDone, yearRange } from './taskView.ts';
import { useTaskSheets } from './useTaskSheets.tsx';
import s from './TaskPages.module.css';

/** A kiválasztott év feladatai hónapok szerint; az idei évben a lejártak elöl, utána a mai naptól. */
export function ScheduledPage() {
  const { year } = useYear();
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));
  const range = yearRange(year);
  const { data: tasks, isLoading } = useTasks(range.from, range.to);
  const [showDone, setShowDone] = useStoredState('kerttervezo.showDone', true);
  const checks = useYearChecks(year);
  const sheets = useTaskSheets();

  const all = tasks ?? [];
  const current = year === thisYear;
  const overdue = current ? all.filter((t) => t.date < today && (!isDone(t) || (showDone && t.done_on === today))) : [];
  const later = all.filter((t) => (!current || t.date >= today) && (showDone || !isDone(t)));
  const byMonth = Map.groupBy(later, (t) => t.date.slice(0, 7));
  const open = all.filter((t) => !isDone(t)).length;
  const newDate = current ? today : `${year}-01-01`;

  const row = (t: (typeof all)[number]) => (
    <TaskListRow key={t.key} task={t} showDate="weekday" issues={checks.byPlanting.get(t.planting_id ?? -1)} onOpen={sheets.open} />
  );

  return (
    <div className={s.page}>
      <PageHeader
        title="Ütemezett"
        color="var(--c-red)"
        count={open}
        subtitle={current ? `${year} · a mai naptól, hónapok szerint` : `${year} · az év feladatai hónapok szerint`}
        actions={
          <>
            <ToolbarButton label={showDone ? 'Elvégzettek elrejtése' : 'Elvégzettek mutatása'} onClick={() => setShowDone(!showDone)}>
              {showDone ? <EyeOff size={19} strokeWidth={2.2} /> : <Eye size={19} strokeWidth={2.2} />}
            </ToolbarButton>
            <ToolbarButton label="Új feladat" onClick={() => sheets.create(newDate)}>
              <Plus size={19} strokeWidth={2.2} />
            </ToolbarButton>
          </>
        }
      />

      {overdue.length > 0 && (
        <Section title="Lejárt" tone="danger" detail={overdue.length}>
          {overdue.map(row)}
        </Section>
      )}

      {[...byMonth.entries()].map(([month, items]) => (
        <Section key={month} title={capitalize(MONTHS_HU[Number(month.slice(5, 7)) - 1]!)}>
          {items.map(row)}
        </Section>
      ))}

      {!isLoading && overdue.length === 0 && later.length === 0 && (
        <div className={s.empty} style={{ '--c': 'var(--c-red)' } as CSSProperties}>
          <CalendarClock size={44} strokeWidth={1.8} className={s.emptyIcon} />
          <p className={s.emptyTitle}>{all.length ? 'Minden feladat elvégezve' : `${year}: nincs ütemezett feladat`}</p>
          <p>
            {all.length
              ? 'Az elvégzett feladatokat a szem ikonnal jelenítheted meg.'
              : 'Ha az éves tervbe felveszed az ültetéseket, a vetés, palántanevelés, kiültetés és betakarítás teendői itt jelennek meg.'}
          </p>
          <button type="button" className={s.emptyButton} onClick={() => sheets.create(newDate)}>
            <Plus size={16} strokeWidth={2.6} />
            Új feladat
          </button>
        </div>
      )}

      {sheets.sheets}
    </div>
  );
}
