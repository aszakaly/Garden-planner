import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import type { FrostDates } from '@shared/domain/dates.ts';
import { effectiveDates, occupancyPeriod } from '@shared/domain/plantings.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import type { Period } from '@shared/domain/geometry.ts';
import type { Bed, PlantingListItem } from '@shared/types.ts';
import { colorVar } from '../../lib/colors.ts';
import { cropColor } from '../../lib/cropColors.ts';
import { TimeGrid } from './TimeGrid.tsx';
import { makeTimeScale } from './timeScale.ts';
import { effectiveBedId, plantingTitle } from './plantingView.ts';
import s from './Timeline.module.css';

interface Props {
  year: number;
  beds: Bed[];
  plantings: PlantingListItem[];
  clashIds: Set<number>;
  frost: FrostDates;
  onSelect: (p: PlantingListItem) => void;
}

const W = 900;
const LABEL_W = 150;
const PAD = { right: 12, top: 26 };
const LANE_H = 20;
const ROW_GAP = 10;

interface Row {
  key: string;
  label: string;
  color: string;
  bedId?: number;
  lanes: { p: PlantingListItem; period: Period }[][];
}

/** Sávokba rendezés: az időben átfedő ültetések egymás alá kerülnek. */
function toLanes(items: { p: PlantingListItem; period: Period }[]) {
  const lanes: { p: PlantingListItem; period: Period }[][] = [];
  for (const item of [...items].sort((a, b) => a.period.start.localeCompare(b.period.start))) {
    const lane = lanes.find((l) => l.at(-1)!.period.end <= item.period.start);
    if (lane) lane.push(item);
    else lanes.push([item]);
  }
  return lanes;
}

/**
 * A kert éves áttekintése: ágyásonként egy sor, benne az ültetések időszakai
 * (zöldségcsoport szerinti színnel). Az ágyás nevére kattintva megnyílik az ágyás.
 */
export function GardenTimeline({ year, beds, plantings, clashIds, frost, onSelect }: Props) {
  const navigate = useNavigate();
  const scale = makeTimeScale(year, LABEL_W, W - LABEL_W - PAD.right);
  const dated = plantings.flatMap((p) => {
    const period = occupancyPeriod(p);
    return period && period.end > scale.start && period.start < scale.next ? [{ p, period }] : [];
  });

  const rows: Row[] = beds.map((b) => ({
    key: `b${b.id}`,
    label: b.name,
    color: colorVar(b.color),
    bedId: b.id,
    lanes: toLanes(dated.filter((d) => effectiveBedId(d.p) === b.id)),
  }));
  const unplaced = dated.filter((d) => effectiveBedId(d.p) == null);
  if (unplaced.length) {
    rows.push({ key: 'nincs', label: 'Elhelyezésre vár', color: 'var(--c-gray)', lanes: toLanes(unplaced) });
  }

  let cursorY = PAD.top;
  const layout = rows.map((r) => {
    const h = Math.max(1, r.lanes.length) * LANE_H + ROW_GAP;
    const top = cursorY;
    cursorY += h;
    return { ...r, top, h };
  });
  const H = cursorY + 6;

  return (
    <div className={s.scroller}>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label={`A kert ültetései ${year}`}>
        <TimeGrid scale={scale} top={PAD.top} height={cursorY - PAD.top} frost={frost} />
        {layout.map((r) => (
          <g key={r.key}>
            <line className={s.rowLine} x1={0} x2={W - PAD.right} y1={r.top + r.h} y2={r.top + r.h} />
            <g
              className={r.bedId ? s.bedLabel : s.bedLabelMuted}
              onClick={r.bedId ? () => navigate(`/agyas/${r.bedId}`) : undefined}
            >
              <circle cx={8} cy={r.top + ROW_GAP / 2 + LANE_H / 2} r={5} style={{ fill: r.color }} />
              <text x={20} y={r.top + ROW_GAP / 2 + LANE_H / 2} dominantBaseline="central">
                {r.label.length > 19 ? `${r.label.slice(0, 18)}…` : r.label}
              </text>
              <title>{r.label}</title>
            </g>
            {r.lanes.map((lane, li) =>
              lane.map(({ p, period }) => {
                const x0 = scale.x(period.start);
                const x1 = scale.x(period.end);
                if (x1 - x0 < 1) return null;
                const top = r.top + ROW_GAP / 2 + li * LANE_H + 2;
                const h = LANE_H - 4;
                const d = effectiveDates(p);
                const xh = d.harvestStart && d.harvestStart > period.start ? Math.min(x1, scale.x(d.harvestStart)) : x1;
                const planned = !(p.actual_transplant_date ?? p.actual_sow_date);
                return (
                  <g
                    key={p.id}
                    className={`${s.item} ${planned ? s.planned : ''} ${clashIds.has(p.id) ? s.clashing : ''}`}
                    style={{ '--sc': cropColor(p.crop_group_code) } as CSSProperties}
                    onClick={() => onSelect(p)}
                  >
                    <clipPath id={`gt-${p.id}`}>
                      <rect x={x0} y={top} width={x1 - x0} height={h} rx={4} />
                    </clipPath>
                    <g clipPath={`url(#gt-${p.id})`}>
                      <rect className={s.grow} x={x0} y={top} width={x1 - x0} height={h} />
                      {xh < x1 && <rect className={s.harvest} x={xh} y={top} width={x1 - xh} height={h} />}
                      <text className={s.label} x={x0 + 5} y={top + h / 2} dominantBaseline="central">
                        {p.plant_name}
                      </text>
                    </g>
                    <rect className={s.outline} x={x0 + 0.75} y={top + 0.75} width={Math.max(0, x1 - x0 - 1.5)} height={h - 1.5} rx={4} />
                    <title>
                      {plantingTitle(p)}
                      {'\n'}
                      {shortDate(period.start)} – {shortDate(period.end)}
                    </title>
                  </g>
                );
              }),
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
