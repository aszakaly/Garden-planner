import type { FrostDates } from '@shared/domain/dates.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import { todayISO } from '../../lib/format.ts';
import type { TimeScale } from './timeScale.ts';
import s from './Timeline.module.css';

interface Props {
  scale: TimeScale;
  top: number;
  height: number;
  frost: FrostDates;
  cursor?: string | null;
}

/** Hónapsávok, hónapnevek, fagyhatárok és a mai nap jelölése az idővonalakon. */
export function TimeGrid({ scale, top, height, frost, cursor }: Props) {
  const today = todayISO();
  const bottom = top + height;
  return (
    <g>
      {scale.months.map((m) => (
        <g key={m.m}>
          {m.m % 2 === 1 && <rect className={s.band} x={m.x0} y={top} width={m.x1 - m.x0} height={height} />}
          <text className={s.month} x={(m.x0 + m.x1) / 2} y={top - 8} textAnchor="middle">
            {m.label}
          </text>
        </g>
      ))}
      {[frost.lastFrost, frost.firstFrost].map((md, i) => (
        <g key={md} className={s.frost}>
          <line x1={scale.frost(md)} x2={scale.frost(md)} y1={top} y2={bottom} />
          <title>{i === 0 ? `Utolsó tavaszi fagy: ${shortDate(md)}` : `Első őszi fagy: ${shortDate(md)}`}</title>
        </g>
      ))}
      {scale.inYear(today) && (
        <g className={s.today}>
          <line x1={scale.x(today)} x2={scale.x(today)} y1={top - 2} y2={bottom} />
          <title>Ma</title>
        </g>
      )}
      {cursor && scale.inYear(cursor) && (
        <line className={s.cursor} x1={scale.x(cursor)} x2={scale.x(cursor)} y1={top} y2={bottom} />
      )}
    </g>
  );
}
