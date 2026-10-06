import { LAYOUT_PHASES, LAYOUT_PHASE_LABEL, type LayoutPhase } from '@shared/labels.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import type { Placement } from '@shared/domain/geometry.ts';
import type { Bed } from '@shared/types.ts';
import { DateInput } from '../../components/ui/Form.tsx';
import { rectOf } from './LayoutCanvas.tsx';
import s from './BedLayout.module.css';

export type PhasePreview = { placement: Placement; color: string }[];

interface Props {
  bed: Bed;
  year: number;
  days: Record<LayoutPhase, string>;
  day: string;
  previews: Record<LayoutPhase, PhasePreview>;
  onChange: (day: string) => void;
}

/** Elő-, fő- és utóvetemény kis előnézettel, valamint tetszőleges nap. */
export function LayoutPhasePicker({ bed, year, days, day, previews, onChange }: Props) {
  const across = bed.row_direction === 'keresztben';
  return (
    <div className={s.phases}>
      {LAYOUT_PHASES.map((phase) => {
        const on = days[phase] === day;
        return (
          <button
            key={phase}
            type="button"
            aria-pressed={on}
            className={`${s.phase} ${on ? s.phaseOn : ''}`}
            onClick={() => onChange(days[phase])}
          >
            <span className={s.phaseName}>{LAYOUT_PHASE_LABEL[phase]}</span>
            <span className={s.phaseDay}>{shortDate(days[phase])}</span>
            <svg className={s.mini} viewBox={`0 0 ${bed.length_cm} ${bed.width_cm}`} preserveAspectRatio="none" aria-hidden>
              <rect className={s.miniBed} width={bed.length_cm} height={bed.width_cm} />
              {previews[phase].map((p, i) => {
                const r = rectOf(p.placement, across);
                return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: p.color }} />;
              })}
            </svg>
          </button>
        );
      })}
      <label className={s.dayPick}>
        <span>Nap</span>
        <DateInput value={day} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(v) => v && onChange(v)} />
      </label>
    </div>
  );
}
