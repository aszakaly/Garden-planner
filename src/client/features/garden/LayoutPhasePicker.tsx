import { useState } from 'react';
import { LAYOUT_PHASES, LAYOUT_PHASE_LABEL, type LayoutPhase } from '@shared/labels.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import type { Placement } from '@shared/domain/geometry.ts';
import type { Bed } from '@shared/types.ts';
import { DateInput } from '../../components/ui/Form.tsx';
import { rectOf } from './canvasGeometry.ts';
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
  // A félig begépelt nap csak a mezőben látszik: a Chrome az évet számjegyenként jelenti
  // (0002-07-01, 0020-07-01 …), ezért csak a tervezési év napja jut tovább. Az elhagyott,
  // éven kívüli érték visszaáll a választott napra. A piszkozat ahhoz a naphoz tartozik,
  // amelyikből kiindult: ha a nap közben máshonnan változik, az új nap látszik.
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null);
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
        <DateInput
          value={draft?.base === day ? draft.value : day}
          min={`${year}-01-01`}
          max={`${year}-12-31`}
          onChange={(v) => {
            if (v?.startsWith(`${year}-`)) {
              setDraft(null);
              onChange(v);
            } else setDraft({ base: day, value: v ?? '' });
          }}
          onBlur={() => setDraft(null)}
        />
      </label>
    </div>
  );
}
