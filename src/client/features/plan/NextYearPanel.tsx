import { Lightbulb, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ROTATION_STAGE_NOUN } from '@shared/labels.ts';
import { toRotationCrop, type ChecksContext } from '@shared/domain/plantingChecks.ts';
import { effectiveBedId } from '@shared/domain/plantings.ts';
import { bedRotationSummary } from '@shared/domain/rotation.ts';
import { yearFrom, yearIn } from '@shared/text.ts';
import type { BedListItem } from '@shared/types.ts';
import { colorVar } from '../../lib/colors.ts';
import s from './PlanPage.module.css';

interface Props {
  year: number;
  beds: BedListItem[];
  ctx: ChecksContext | null;
  onSuggest: (bedId: number) => void;
  onNew: () => void;
}

/** Üres tervév: ágyásonként, mit javasol a vetésforgó az előzmények alapján. */
export function NextYearPanel({ year, beds, ctx, onSuggest, onNew }: Props) {
  const active = beds.filter((b) => b.active);
  return (
    <div className={s.nextYear}>
      <div className={s.empty}>
        <p className={s.emptyTitle}>Ebben az évben ({year}) még nincs tervezett ültetés</p>
        <p>
          Vedd fel, mit hova és mikor vetsz vagy ültetsz: a dátumokat a növény termesztési időszakából javasolja a
          program, és az ágyásban a következő szabad sávot keresi meg. Ha nem tudod, mivel kezdd, kérj javaslatot
          ágyásonként – az előző évek alapján rangsorol.
        </p>
        <button type="button" className={s.emptyButton} onClick={onNew}>
          <Plus size={16} strokeWidth={2.4} /> Első ültetés felvétele
        </button>
      </div>

      {ctx && active.length > 0 && (
        <section className={s.bedHints}>
          <h2 className={s.bedHintsTitle}>Ágyásonként, az előzmények alapján</h2>
          <div className={s.bedHintList}>
            {active.map((bed) => {
              const history = ctx.all.filter((p) => effectiveBedId(p) === bed.id && p.year < year && p.status !== 'elmaradt');
              const summary = bedRotationSummary(history.map(toRotationCrop), year, ctx.families);
              const lines: string[] = [];
              if (summary.next && summary.last) {
                lines.push(
                  `Javasolt: ${ROTATION_STAGE_NOUN[summary.next]} (${yearIn(summary.last.year)} ${ROTATION_STAGE_NOUN[summary.last.stages[0]!]} volt itt)`,
                );
              } else if (summary.last) {
                lines.push(`${yearIn(summary.last.year)} vegyesen: ${summary.last.stages.map((st) => ROTATION_STAGE_NOUN[st]).join(', ')}`);
              } else {
                lines.push('Nincs rögzített előzmény');
              }
              if (summary.blocked.length) {
                lines.push(`Még ne: ${summary.blocked.map((b) => `${b.name.toLocaleLowerCase('hu')} (${yearFrom(b.from)})`).join(', ')}`);
              }
              return (
                <div key={bed.id} className={s.bedHint} style={{ '--bc': colorVar(bed.color) } as CSSProperties}>
                  <span className={s.bedHintDot} />
                  <span className={s.bedHintBody}>
                    <Link to={`/agyas/${bed.id}`} className={s.bedHintName}>
                      {bed.name}
                    </Link>
                    {lines.map((l) => (
                      <span key={l} className={s.bedHintLine}>
                        {l}
                      </span>
                    ))}
                  </span>
                  <button type="button" className={s.bedHintButton} onClick={() => onSuggest(bed.id)}>
                    <Lightbulb size={14} strokeWidth={2.4} />
                    Mi kerülhet ide?
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
