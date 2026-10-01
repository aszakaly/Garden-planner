import { ChevronLeft, ChevronRight, Plus, Snowflake } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { TASK_CATEGORIES, TASK_CATEGORY_LABEL, type TaskCategory, type TaskItem } from '@shared/domain/tasks.ts';
import { DEFAULT_SETTINGS } from '@shared/settings.ts';
import { capitalize } from '@shared/text.ts';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { formatDay, formatWeekday, relativeDayLabel, todayISO } from '../../lib/format.ts';
import { useBeds, useSettings, useTasks } from '../../lib/queries.ts';
import { useIsMobile } from '../../lib/useIsMobile.ts';
import { useStoredState } from '../../lib/useStoredState.ts';
import { useYear } from '../../lib/year.tsx';
import { useYearChecks } from '../plan/useChecks.ts';
import { TaskListRow } from '../tasks/TaskListRow.tsx';
import { CATEGORY_COLOR, yearRange } from '../tasks/taskView.ts';
import { useTaskSheets } from '../tasks/useTaskSheets.tsx';
import { frostLabel, monthGrid, monthTitle, shiftMonth } from './calendarView.ts';
import { MonthGrid } from './MonthGrid.tsx';
import { YearOverview } from './YearOverview.tsx';
import s from './Calendar.module.css';

type View = 'honap' | 'ev';
/** 'all': minden · 'none': ágyás nélküli · egyébként az ágyás azonosítója */
type BedFilter = string;

/** Naptár: havi rács a napok feladataival, a kiválasztott nap listája, éves áttekintés fagyhatárokkal. */
export function CalendarPage() {
  const { year } = useYear();
  const today = todayISO();
  const thisYear = Number(today.slice(0, 4));
  const isMobile = useIsMobile();
  const [view, setView] = useStoredState<View>('kerttervezo.calendarView', 'honap');
  const [month, setMonth] = useState(() => `${year}-${today.slice(5, 7)}`);
  const [selected, setSelected] = useState(() => (year === thisYear ? today : `${year}-${today.slice(5, 7)}-01`));
  const [hidden, setHidden] = useStoredState<TaskCategory[]>('kerttervezo.calendarHidden', []);
  const [bedFilter, setBedFilter] = useStoredState<BedFilter>('kerttervezo.calendarBed', 'all');
  const calYear = Number(month.slice(0, 4));

  // Ha a tervezési év változik, a naptár ugyanarra a hónapra ugrik az új évben
  useEffect(() => {
    if (Number(month.slice(0, 4)) === year) return;
    const next = `${year}-${month.slice(5, 7)}`;
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  }, [year]);

  const grid = monthGrid(month);
  const monthTasks = useTasks(grid[0]!, grid.at(-1)!);
  const yr = yearRange(calYear);
  const yearTasks = useTasks(yr.from, yr.to);
  const { data: settings = DEFAULT_SETTINGS } = useSettings();
  const { data: beds = [] } = useBeds(calYear);
  const checks = useYearChecks(calYear);
  const sheets = useTaskSheets();

  const visible = (t: TaskItem) =>
    !hidden.includes(t.category) &&
    (bedFilter === 'all' || (bedFilter === 'none' ? t.bed_id === null : String(t.bed_id) === bedFilter));
  const shownMonth = (monthTasks.data ?? []).filter(visible);
  const dayTasks = shownMonth.filter((t) => t.date === selected);
  const frostText = frostLabel(selected, settings);

  const go = (delta: number) => {
    if (view === 'ev') {
      setMonth(`${calYear + delta}-${month.slice(5, 7)}`);
      return;
    }
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  };
  const goToday = () => {
    setMonth(today.slice(0, 7));
    setSelected(today);
  };
  const pickDay = (day: string) => {
    setMonth(day.slice(0, 7));
    setSelected(day);
    setView('honap');
  };
  const toggleCategory = (c: TaskCategory) => setHidden(hidden.includes(c) ? hidden.filter((x) => x !== c) : [...hidden, c]);
  const dayLabel = relativeDayLabel(selected, today);
  const relative = ['Ma', 'Holnap', 'Tegnap'].includes(dayLabel);

  return (
    <div className={s.page}>
      <PageHeader
        title="Naptár"
        color="var(--c-indigo)"
        actions={
          <ToolbarButton label="Új feladat a kiválasztott napra" onClick={() => sheets.create(selected)}>
            <Plus size={19} strokeWidth={2.2} />
          </ToolbarButton>
        }
      />

      <div className={s.controls}>
        <div className={s.nav}>
          <button type="button" className={s.navButton} onClick={() => go(-1)} aria-label={view === 'ev' ? 'Előző év' : 'Előző hónap'}>
            <ChevronLeft size={20} strokeWidth={2.4} />
          </button>
          <h2 className={s.navTitle}>{view === 'ev' ? calYear : monthTitle(month)}</h2>
          <button type="button" className={s.navButton} onClick={() => go(1)} aria-label={view === 'ev' ? 'Következő év' : 'Következő hónap'}>
            <ChevronRight size={20} strokeWidth={2.4} />
          </button>
          <button type="button" className={s.todayButton} onClick={goToday}>
            Ma
          </button>
        </div>
        <SegmentedControl<View>
          label="Nézet"
          size="small"
          value={view}
          options={[
            { value: 'honap', label: 'Hónap' },
            { value: 'ev', label: 'Év' },
          ]}
          onChange={setView}
        />
      </div>

      <div className={s.filters}>
        {TASK_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`${s.filterChip} ${hidden.includes(c) ? s.filterOff : ''}`}
            style={{ '--c': CATEGORY_COLOR[c] } as CSSProperties}
            aria-pressed={!hidden.includes(c)}
            onClick={() => toggleCategory(c)}
          >
            <i />
            {TASK_CATEGORY_LABEL[c]}
          </button>
        ))}
        <select className={s.bedSelect} value={bedFilter} onChange={(e) => setBedFilter(e.target.value)} aria-label="Ágyás szűrése">
          <option value="all">Minden ágyás</option>
          {beds.map((b) => (
            <option key={b.id} value={String(b.id)}>
              {b.name}
            </option>
          ))}
          <option value="none">Ágyás nélkül</option>
        </select>
      </div>

      {view === 'honap' ? (
        <>
          <MonthGrid
            month={month}
            tasks={shownMonth}
            selected={selected}
            today={today}
            frost={settings}
            compact={isMobile}
            onSelect={setSelected}
          />

          <Section
            title={relative ? dayLabel : capitalize(formatDay(selected))}
            detail={relative ? `${formatDay(selected)}, ${formatWeekday(selected)}` : formatWeekday(selected)}
          >
            {frostText && (
              <p className={s.frostNote}>
                <Snowflake size={14} strokeWidth={2.4} />
                {frostText} (Beállítások)
              </p>
            )}
            {dayTasks.map((t) => (
              <TaskListRow key={t.key} task={t} issues={checks.byPlanting.get(t.planting_id ?? -1)} onOpen={sheets.open} />
            ))}
            <button type="button" className={s.addRow} onClick={() => sheets.create(selected)}>
              <Plus size={16} strokeWidth={2.6} />
              Új feladat erre a napra
            </button>
          </Section>
        </>
      ) : (
        <YearOverview
          year={calYear}
          tasks={(yearTasks.data ?? []).filter(visible)}
          today={today}
          frost={settings}
          categories={TASK_CATEGORIES.filter((c) => !hidden.includes(c))}
          onPickDay={pickDay}
          onPickMonth={(m) => {
            setMonth(m);
            setSelected(m === today.slice(0, 7) ? today : `${m}-01`);
            setView('honap');
          }}
        />
      )}

      {sheets.sheets}
    </div>
  );
}
