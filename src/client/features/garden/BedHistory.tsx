import type { CSSProperties } from 'react';
import { ROTATION_STAGE_NOUN, type CheckLevel } from '@shared/labels.ts';
import { effectiveBedId } from '@shared/domain/plantings.ts';
import { isConfirmed, toRotationCrop, type ChecksContext } from '@shared/domain/plantingChecks.ts';
import { bedRotationSummary } from '@shared/domain/rotation.ts';
import { yearFrom, yearIn } from '@shared/text.ts';
import type { Bed, PlantingListItem } from '@shared/types.ts';
import { NoticeList } from '../../components/ui/Notice.tsx';
import { cropColor } from '../../lib/cropColors.ts';
import s from './BedHistory.module.css';

interface Props {
  bed: Bed;
  year: number;
  ctx: ChecksContext | null;
  onOpen: (p: PlantingListItem) => void;
  onAdd: (year: number) => void;
}

/** Az ágyás korábbi évei és a vetésforgó-javaslat a kiválasztott évre. */
export function BedHistory({ bed, year, ctx, onOpen, onAdd }: Props) {
  if (!ctx) return null;
  const history = ctx.all.filter((p) => effectiveBedId(p) === bed.id && p.year < year && p.status !== 'elmaradt');
  const summary = bedRotationSummary(history.map(toRotationCrop), year, ctx.families);
  const years = [...new Set([year - 1, year - 2, year - 3, ...history.map((p) => p.year)])].sort((a, b) => b - a);

  const notices: { level: CheckLevel | 'ok'; message: string }[] = [];
  if (summary.next && summary.last) {
    notices.push({
      level: 'ok',
      message: `Javasolt ide (${year}): ${ROTATION_STAGE_NOUN[summary.next]} – ${yearIn(summary.last.year)} ${ROTATION_STAGE_NOUN[summary.last.stages[0]!]} volt itt (hüvelyes → levél → termés → gyökér).`,
    });
  } else if (summary.last) {
    notices.push({
      level: 'info',
      message: `${yearIn(summary.last.year)} vegyesen állt itt ${summary.last.stages.map((st) => ROTATION_STAGE_NOUN[st]).join(' és ')} – az egyes sávokat az ültetés szerkesztője ellenőrzi.`,
    });
  }
  if (summary.blocked.length) {
    notices.push({
      level: 'figyelem',
      message: `Még ne kerüljön ide: ${summary.blocked.map((b) => `${b.name.toLocaleLowerCase('hu')} (${yearFrom(b.from)})`).join(', ')}.`,
    });
  }
  if (!history.length) {
    notices.push({
      level: 'info',
      message: 'Még nincs rögzített előzmény. Elég az évet és a növényt megadni – a vetésforgó-ellenőrzés ebből is dolgozik.',
    });
  }

  return (
    <>
      <div className={s.years}>
        {years.map((y) => {
          const items = history.filter((p) => p.year === y);
          return (
            <div key={y} className={s.year}>
              <span className={s.label}>{y}</span>
              <span className={s.items}>
                {items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={s.item}
                    style={{ '--sc': cropColor(p.crop_group_code) } as CSSProperties}
                    onClick={() => onOpen(p)}
                    title={isConfirmed(p) ? undefined : 'Csak terv volt – nincs megerősítve, hogy megvalósult'}
                  >
                    <span className={s.dot} />
                    {p.variety_name ? `${p.plant_name} – ${p.variety_name}` : p.plant_name}
                    {!isConfirmed(p) && <span className={s.planned}>terv</span>}
                  </button>
                ))}
                {!items.length && <span className={s.none}>nincs rögzítve</span>}
                <button type="button" className={s.add} onClick={() => onAdd(y)}>
                  ＋ Rögzítés
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <NoticeList items={notices} />
    </>
  );
}
