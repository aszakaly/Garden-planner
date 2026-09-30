import type { CSSProperties } from 'react';
import { MONTHS_SHORT_HU, SEASON_LABEL, WINDOW_METHOD_LABEL } from '@shared/labels.ts';
import { dayOfYear, SEGMENT_LABEL, windowSegments, type SegmentKind } from '@shared/domain/calendar.ts';
import type { GrowingWindow } from '@shared/types.ts';
import { todayISO } from '../../lib/format.ts';
import { SEGMENT_COLOR } from './segmentColors.ts';
import s from './SeasonCalendar.module.css';

interface Props {
  windows: GrowingWindow[];
  lastFrost?: string;
  firstFrost?: string;
  onSelect?: (w: GrowingWindow) => void;
}

const pct = (x: number) => `${(x * 100).toFixed(3)}%`;

/** 12 hónapos termesztési naptár: szezononként egy sáv a vetés/kiültetés/betakarítás szakaszaival. */
export function SeasonCalendar({ windows, lastFrost, firstFrost, onSelect }: Props) {
  const today = dayOfYear(todayISO().slice(5)) / 365;
  const kinds = new Set(windows.flatMap((w) => windowSegments(w).map((sg) => sg.kind)));
  const hasNextYear = windows.some((w) => windowSegments(w).some((sg) => sg.nextYear));

  return (
    <div className={s.calendar}>
      <div className={s.grid}>
        <div className={s.months}>
          {MONTHS_SHORT_HU.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>

        <div className={s.rows}>
          <div className={s.overlay} aria-hidden>
            {Array.from({ length: 11 }, (_, i) => (
              <span key={i} className={s.monthLine} style={{ left: pct(dayOfYear(`${String(i + 2).padStart(2, '0')}-01`) / 365) }} />
            ))}
            {lastFrost && (
              <span className={s.frost} style={{ left: pct(dayOfYear(lastFrost) / 365) }} title="Utolsó tavaszi fagy" />
            )}
            {firstFrost && (
              <span className={s.frost} style={{ left: pct(dayOfYear(firstFrost) / 365) }} title="Első őszi fagy" />
            )}
            <span className={s.today} style={{ left: pct(today) }} title="Ma" />
          </div>

          {windows.map((w) => (
            <button
              key={w.id}
              type="button"
              className={s.row}
              onClick={() => onSelect?.(w)}
              disabled={!onSelect}
            >
              <span className={s.rowLabel}>
                <strong>{SEASON_LABEL[w.season]}</strong> · {WINDOW_METHOD_LABEL[w.method].split(' ')[0]!.toLowerCase()}
                {w.seedling_weeks ? ` · ${w.seedling_weeks} hét nevelés` : ''}
                {w.succession_days ? ` · ${w.succession_days} naponta újra` : ''}
              </span>
              <span className={s.track}>
                {windowSegments(w).map((sg, i) => (
                  <span
                    key={i}
                    className={`${s.segment} ${sg.nextYear ? s.nextYear : ''}`}
                    style={{ left: pct(sg.start), width: pct(sg.end - sg.start), '--c': SEGMENT_COLOR[sg.kind] } as CSSProperties}
                    title={`${SEGMENT_LABEL[sg.kind]}${sg.nextYear ? ' (következő évben)' : ''}`}
                  />
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={s.legend}>
        {(Object.keys(SEGMENT_LABEL) as SegmentKind[])
          .filter((k) => kinds.has(k))
          .map((k) => (
            <span key={k} className={s.legendItem}>
              <span className={s.swatch} style={{ '--c': SEGMENT_COLOR[k] } as CSSProperties} />
              {SEGMENT_LABEL[k]}
            </span>
          ))}
        {hasNextYear && (
          <span className={s.legendItem}>
            <span className={`${s.swatch} ${s.nextYear}`} style={{ '--c': 'var(--c-gray)' } as CSSProperties} />
            Következő évben
          </span>
        )}
        {(lastFrost || firstFrost) && (
          <span className={s.legendItem}>
            <span className={s.frostSwatch} />
            Fagyhatár
          </span>
        )}
      </div>
    </div>
  );
}

/** Tömör, két sávos mini naptár a listákhoz (fent vetés/ültetés, lent betakarítás). */
export function MiniCalendar({ windows }: { windows: GrowingWindow[] }) {
  const segs = windows.flatMap(windowSegments);
  const lanes = [segs.filter((x) => x.kind !== 'betakaritas'), segs.filter((x) => x.kind === 'betakaritas')];
  return (
    <span className={s.mini} aria-hidden>
      {lanes.map((lane, i) => (
        <span key={i} className={s.miniLane}>
          {lane.map((sg, j) => (
            <span
              key={j}
              className={`${s.miniSeg} ${sg.nextYear ? s.nextYear : ''}`}
              style={{ left: pct(sg.start), width: pct(sg.end - sg.start), '--c': SEGMENT_COLOR[sg.kind] } as CSSProperties}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

export function MiniCalendarHeader() {
  return (
    <span className={s.miniHeader} aria-hidden>
      {MONTHS_SHORT_HU.map((m) => (
        <span key={m}>{m.charAt(0).toUpperCase()}</span>
      ))}
    </span>
  );
}
