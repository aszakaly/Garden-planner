import { Snowflake } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Settings } from '@shared/settings.ts';
import { formatDay, formatWeekday } from '../../lib/format.ts';
import { EVENT_COLOR, frostLabel, monthGrid, WEEKDAYS_SHORT, type CalendarEvent } from './calendarView.ts';
import s from './Calendar.module.css';

interface Props {
  month: string;
  events: CalendarEvent[];
  selected: string;
  today: string;
  frost: Settings;
  /** Keskeny kijelzőn a feladatok címe helyett csak pöttyök */
  compact: boolean;
  onSelect: (day: string) => void;
}

const MAX_EVENTS = 3;

/**
 * Havi naptár-rács (hétfőtől vasárnapig), napokban a feladatok és naplóbejegyzések címével vagy pöttyével.
 * A színek a feladattípusé, illetve a naplóé (a szűrősor egyben jelmagyarázat is); az ágyásra szűrni lehet.
 */
export function MonthGrid({ month, events, selected, today, frost, compact, onSelect }: Props) {
  const days = monthGrid(month);
  const byDay = Map.groupBy(events, (t) => t.date);

  return (
    <div className={`${s.month} ${compact ? s.compact : ''}`}>
      <div className={s.weekdays} aria-hidden>
        {WEEKDAYS_SHORT.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className={s.grid} role="grid" aria-label="Hónap napjai">
        {days.map((day) => {
          const items = byDay.get(day) ?? [];
          const outside = !day.startsWith(month);
          const frostText = frostLabel(day, frost);
          const open = items.filter((t) => !t.done && t.group !== 'naplo').length;
          const cls = [s.cell, outside && s.outside, day === selected && s.selected, day === today && s.today]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              className={cls}
              aria-selected={day === selected}
              aria-label={`${formatDay(day)}, ${formatWeekday(day)}${items.length ? `, ${items.length} esemény` : ''}${frostText ? `, ${frostText.toLowerCase()}` : ''}`}
              onClick={() => onSelect(day)}
            >
              <span className={s.cellHead}>
                {frostText && <Snowflake size={11} strokeWidth={2.4} className={s.frost} aria-hidden />}
                <span className={s.dayNum}>{Number(day.slice(8))}</span>
              </span>
              {compact ? (
                <span className={s.dots}>
                  {items.slice(0, 4).map((t) => (
                    <i key={t.key} className={t.done ? s.dotDone : undefined} style={{ '--c': EVENT_COLOR[t.group] } as CSSProperties} />
                  ))}
                </span>
              ) : (
                <span className={s.events}>
                  {items.slice(0, MAX_EVENTS).map((t) => (
                    <span
                      key={t.key}
                      className={`${s.event} ${t.done ? s.eventDone : ''} ${t.group === 'naplo' ? s.eventJournal : ''}`}
                      style={{ '--c': EVENT_COLOR[t.group] } as CSSProperties}
                    >
                      {t.title}
                    </span>
                  ))}
                  {items.length > MAX_EVENTS && <span className={s.more}>még {items.length - MAX_EVENTS}</span>}
                </span>
              )}
              {open > 0 && compact && <span className="visually-hidden">{open} nyitott</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
