import type { CSSProperties } from 'react';
import { dayOfYear } from '@shared/domain/calendar.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import { MONTHS_HU, MONTHS_SHORT_HU } from '@shared/labels.ts';
import type { Settings } from '@shared/settings.ts';
import { capitalize } from '@shared/text.ts';
import {
  daysInMonth,
  EVENT_COLOR,
  EVENT_GROUP_LABEL,
  frostLabel,
  weekdayIndex,
  WEEKDAYS_MINI,
  type CalendarEvent,
  type EventGroup,
} from './calendarView.ts';
import s from './Calendar.module.css';

interface Props {
  year: number;
  events: CalendarEvent[];
  today: string;
  frost: Settings;
  /** A megjelenítendő kategóriák (a szűrő szerint) */
  groups: EventGroup[];
  onPickDay: (day: string) => void;
  onPickMonth: (month: string) => void;
}

/** Az év napjának helye százalékban (0–100). */
const pos = (md: string) => (dayOfYear(md) / 365) * 100;
const MONTH_STARTS = MONTHS_SHORT_HU.map((_, i) => `${String(i + 1).padStart(2, '0')}-01`);
/** Keskeny kijelzőn a hónapok kezdőbetűi */
const MONTH_INITIALS = ['J', 'F', 'M', 'Á', 'M', 'J', 'J', 'A', 'Sz', 'O', 'N', 'D'];

/** Éves áttekintés: fagyhatárok, feladatok és naplóbejegyzések egy idővonalon, alatta 12 kis hónap. */
export function YearOverview({ year, events, today, frost, groups, onPickDay, onPickMonth }: Props) {
  const inYear = events.filter((t) => t.date.startsWith(`${year}-`));
  const byDay = Map.groupBy(inYear, (t) => t.date);
  const last = pos(frost.lastFrost);
  const first = pos(frost.firstFrost);
  const showToday = today.startsWith(`${year}-`);
  const rows = groups.filter((c) => inYear.some((t) => t.group === c));

  const lines = (
    <>
      <span className={s.frostLine} style={{ left: `${last}%` }} />
      <span className={s.frostLine} style={{ left: `${first}%` }} />
      {showToday && <span className={s.todayLine} style={{ left: `${pos(today.slice(5))}%` }} />}
    </>
  );

  return (
    <div className={s.year}>
      <div className={s.strip}>
        <div className={s.stripRow}>
          <span className={s.stripLabel}>Fagy</span>
          <div className={s.track}>
            <span className={s.frostBand} style={{ left: 0, width: `${last}%` }} />
            <span className={s.freeBand} style={{ left: `${last}%`, width: `${first - last}%` }}>
              fagymentes: {shortDate(frost.lastFrost)} – {shortDate(frost.firstFrost)}
            </span>
            <span className={s.frostBand} style={{ left: `${first}%`, right: 0 }} />
            {lines}
          </div>
        </div>
        {rows.map((c) => (
          <div key={c} className={s.stripRow}>
            <span className={s.stripLabel}>{EVENT_GROUP_LABEL[c]}</span>
            <div className={s.track}>
              {inYear
                .filter((t) => t.group === c)
                .map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`${s.tick} ${t.done || t.group === 'naplo' ? '' : s.tickOpen}`}
                    style={{ left: `${pos(t.date.slice(5))}%`, '--c': EVENT_COLOR[c] } as CSSProperties}
                    title={`${shortDate(t.date)} · ${t.title}`}
                    aria-label={`${shortDate(t.date)}: ${t.title}`}
                    onClick={() => onPickDay(t.date)}
                  />
                ))}
              {lines}
            </div>
          </div>
        ))}
        <div className={s.stripRow}>
          <span className={s.stripLabel} />
          <div className={s.axis}>
            {MONTH_STARTS.map((md, i) => (
              <span key={md} style={{ left: `${pos(md)}%` }} data-short={MONTH_INITIALS[i]}>
                {MONTHS_SHORT_HU[i]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={s.minis}>
        {MONTHS_HU.map((name, i) => {
          const month = `${year}-${String(i + 1).padStart(2, '0')}`;
          const offset = weekdayIndex(`${month}-01`);
          return (
            <section key={month} className={s.mini}>
              <button type="button" className={s.miniTitle} onClick={() => onPickMonth(month)}>
                {capitalize(name)}
              </button>
              <div className={s.miniGrid}>
                {WEEKDAYS_MINI.map((d, k) => (
                  <span key={k} className={s.miniWeekday}>
                    {d}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, k) => (
                  <span key={`x${k}`} />
                ))}
                {Array.from({ length: daysInMonth(month) }, (_, k) => {
                  const day = `${month}-${String(k + 1).padStart(2, '0')}`;
                  const items = byDay.get(day) ?? [];
                  const cats = [...new Set(items.map((t) => t.group))].slice(0, 3);
                  const frostText = frostLabel(day, frost);
                  return (
                    <button
                      key={day}
                      type="button"
                      className={[s.miniDay, day === today && s.miniToday, frostText && s.miniFrost].filter(Boolean).join(' ')}
                      title={frostText ?? (items.length ? `${items.length} esemény` : undefined)}
                      onClick={() => onPickDay(day)}
                    >
                      <span className={s.miniNum}>{k + 1}</span>
                      <span className={s.miniDots}>
                        {cats.map((c) => (
                          <i key={c} style={{ '--c': EVENT_COLOR[c] } as CSSProperties} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
