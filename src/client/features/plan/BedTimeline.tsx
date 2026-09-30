import { useId, type CSSProperties, type MouseEvent } from 'react';
import type { FrostDates } from '@shared/domain/dates.ts';
import { alongLength, type Clash } from '@shared/domain/geometry.ts';
import { effectiveDates } from '@shared/domain/plantings.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import type { Bed, PlantingListItem } from '@shared/types.ts';
import { cropColor } from '../../lib/cropColors.ts';
import { TimeGrid } from './TimeGrid.tsx';
import { makeTimeScale } from './timeScale.ts';
import { plantingTitle, type PlacedPlanting } from './plantingView.ts';
import s from './Timeline.module.css';

interface Props {
  year: number;
  bed: Bed;
  items: PlacedPlanting[];
  clashes: Clash[];
  frost: FrostDates;
  cursor?: string | null;
  onPickDate?: (iso: string) => void;
  onSelect?: (p: PlantingListItem) => void;
}

const W = 900;
const PAD = { left: 52, right: 12, top: 26, bottom: 8 };

/**
 * Ágyás-idővonal: vízszintesen az év hónapjai, függőlegesen az ágyás hossza (mint a felülnézeten).
 * Ha egy ültetés csak az ágyás szélességének egy részét foglalja, a sávján belül arányosan kisebb.
 * Egy téglalap = egy ültetés helye és ideje; a sötétebb vége a betakarítás, a pontozott
 * vonal előtte a palántanevelés. Szaggatott keret: terv, folytonos: már megtörtént.
 */
export function BedTimeline({ year, bed, items, clashes, frost, cursor, onPickDate, onSelect }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const axis = bed.length_cm;
  const width = bed.width_cm;
  const plotW = W - PAD.left - PAD.right;
  const plotH = Math.round(Math.min(340, Math.max(150, axis * 0.7)));
  const H = PAD.top + plotH + PAD.bottom;
  const scale = makeTimeScale(year, PAD.left, plotW);
  const y = (cm: number) => PAD.top + (cm / axis) * plotH;
  const tickStep = axis <= 160 ? 20 : axis <= 400 ? 50 : axis <= 1000 ? 100 : 250;
  const ticks = Array.from({ length: Math.floor(axis / tickStep) + 1 }, (_, i) => i * tickStep);
  const byId = new Map(items.map((i) => [i.id, i]));
  const clashIds = new Set(clashes.flatMap((c) => [c.a, c.b]));

  const pick = (e: MouseEvent<SVGRectElement>) => {
    if (!onPickDate) return;
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    onPickDate(scale.dateAt(((e.clientX - box.left) / box.width) * W));
  };

  return (
    <div className={s.scroller}>
      <svg viewBox={`0 0 ${W} ${H}`} className={s.svg} role="img" aria-label={`${bed.name} idővonala`}>
        <defs>
          <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine} />
          </pattern>
        </defs>
        <rect className={s.plot} x={PAD.left} y={PAD.top} width={plotW} height={plotH} onClick={pick} />
        <TimeGrid scale={scale} top={PAD.top} height={plotH} frost={frost} cursor={cursor} />
        {ticks.map((cm) => (
          <g key={cm}>
            <line className={s.tick} x1={PAD.left - 4} x2={PAD.left} y1={y(cm)} y2={y(cm)} />
            <text className={s.tickLabel} x={PAD.left - 7} y={y(cm)} textAnchor="end" dominantBaseline="central">
              {cm === 0 ? '0' : `${cm}`}
            </text>
          </g>
        ))}
        <text className={s.unit} x={PAD.left - 7} y={PAD.top - 8} textAnchor="end">
          cm
        </text>

        {items.map((item) => {
          const p = item.planting;
          const d = effectiveDates(p);
          const x0 = scale.x(item.period.start);
          const x1 = scale.x(item.period.end);
          if (x1 - x0 < 1) return null;
          const len = alongLength(item.placement, bed);
          const top = y(len.start + len.span * (len.widthStart / width));
          const h = Math.max(4, (len.span * (len.widthSpan / width) * plotH) / axis);
          const xh = d.harvestStart && d.harvestStart > item.period.start ? Math.min(x1, scale.x(d.harvestStart)) : x1;
          const planned = !(p.actual_transplant_date ?? p.actual_sow_date);
          const tray = p.method === 'palanta' && d.sow && d.sow < item.period.start ? scale.x(d.sow) : null;
          const clipId = `clip-${uid}-${item.id}`;
          const title = [
            plantingTitle(p),
            `${shortDate(item.period.start)} – ${shortDate(item.period.end)}`,
            `${len.start}–${len.start + len.span} cm az ágyás hosszán`,
          ].join('\n');
          return (
            <g
              key={item.id}
              className={`${s.item} ${planned ? s.planned : ''} ${clashIds.has(item.id) ? s.clashing : ''}`}
              style={{ '--sc': cropColor(p.crop_group_code) } as CSSProperties}
              onClick={() => onSelect?.(p)}
            >
              <clipPath id={clipId}>
                <rect x={x0} y={top} width={x1 - x0} height={h} rx={4} />
              </clipPath>
              {tray !== null && (
                <>
                  <line className={s.tray} x1={tray} x2={x0} y1={top + h / 2} y2={top + h / 2} />
                  <circle className={s.trayDot} cx={tray} cy={top + h / 2} r={2.5} />
                </>
              )}
              <g clipPath={`url(#${clipId})`}>
                <rect className={s.grow} x={x0} y={top} width={x1 - x0} height={h} />
                {xh < x1 && <rect className={s.harvest} x={xh} y={top} width={x1 - xh} height={h} />}
                {h >= 13 && (
                  <text className={s.label} x={x0 + 6} y={top + h / 2} dominantBaseline="central">
                    {p.plant_name}
                  </text>
                )}
              </g>
              <rect className={s.outline} x={x0 + 0.75} y={top + 0.75} width={Math.max(0, x1 - x0 - 1.5)} height={Math.max(0, h - 1.5)} rx={4} />
              <title>{title}</title>
            </g>
          );
        })}

        {clashes.map((c) => {
          const a = byId.get(c.a)!;
          const b = byId.get(c.b)!;
          const la = alongLength(a.placement, bed);
          const lb = alongLength(b.placement, bed);
          const top = Math.max(la.start, lb.start);
          const bottom = Math.min(la.start + la.span, lb.start + lb.span);
          const x0 = scale.x(c.period.start);
          const x1 = scale.x(c.period.end);
          if (x1 - x0 < 1 || bottom <= top) return null;
          return (
            <rect
              key={`${c.a}-${c.b}`}
              className={s.clash}
              x={x0}
              y={y(top)}
              width={x1 - x0}
              height={y(bottom) - y(top)}
              fill={`url(#hatch-${uid})`}
            >
              <title>
                Ütközés: {a.planting.plant_name} és {b.planting.plant_name} ({shortDate(c.period.start)} – {shortDate(c.period.end)})
              </title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
