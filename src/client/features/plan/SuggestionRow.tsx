import { ChevronRight, Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Suggestion, SuggestionRank, SuggestionReason } from '@shared/domain/suggestions.ts';
import { Chip } from '../../components/ui/Chip.tsx';
import { blankPlanting, datesSummary } from './plantingView.ts';
import s from './SuggestionSheet.module.css';

export const REASON_TONE: Record<SuggestionReason['level'], 'good' | 'neutral' | 'warn' | 'bad'> = {
  ok: 'good',
  info: 'neutral',
  figyelem: 'warn',
  kerulendo: 'bad',
};
export const RANK_COLOR: Record<SuggestionRank, string> = {
  ajanlott: 'var(--c-green)',
  lehetseges: 'var(--c-gray)',
  kerulendo: 'var(--c-red)',
};

interface Props {
  suggestion: Suggestion;
  year: number;
  /** A zöldségcsoport színe */
  color: string;
  onPick: () => void;
  /** Előnézet: a sor fölé vitt egér vagy a fókusz */
  onPreview?: (on: boolean) => void;
  /** A sor végén: nyíl (új lapot nyit) vagy plusz (azonnal felveszi) */
  action?: 'open' | 'add';
  /** A hely leírása a sorszám és a hely helyett (pl. beszúrásnál, ahol a hely a választáskor készül el) */
  place?: string;
}

/** Egy „Mi kerülhet ide?” javaslat: időzítés, hely és az okok címkékkel. */
export function SuggestionRow({ suggestion: sg, year, color, onPick, onPreview, action = 'open', place: placeText }: Props) {
  const p = sg.placement;
  const summary = datesSummary(
    {
      ...blankPlanting(),
      year,
      method: sg.method,
      plan_sow_date: sg.dates.sow,
      plan_transplant_date: sg.dates.transplant,
      plan_harvest_start: sg.dates.harvestStart,
      plan_end_date: sg.dates.end,
    },
    year,
  );
  const place = placeText ?? `${sg.rows} sor · ${Math.round(p.axis_start_cm)}–${Math.round(p.axis_start_cm + p.axis_span_cm)} cm`;
  return (
    <button
      type="button"
      className={s.row}
      onClick={onPick}
      onMouseEnter={onPreview && (() => onPreview(true))}
      onMouseLeave={onPreview && (() => onPreview(false))}
      onFocus={onPreview && (() => onPreview(true))}
      onBlur={onPreview && (() => onPreview(false))}
      style={{ '--sc': color, '--rc': RANK_COLOR[sg.rank] } as CSSProperties}
    >
      <span className={s.swatch} />
      <span className={s.body}>
        <span className={s.title}>
          {sg.plant.name_hu}
          {sg.variety_name && <span className={s.variety}> – {sg.variety_name}</span>}
        </span>
        <span className={s.meta}>
          {summary} · {place}
        </span>
        <span className={s.chips}>
          {sg.reasons.map((r) => (
            <span key={r.text} title={r.detail}>
              <Chip tone={REASON_TONE[r.level]}>{r.text}</Chip>
            </span>
          ))}
        </span>
      </span>
      {action === 'add' ? (
        <span className={s.add} aria-hidden>
          <Plus size={16} strokeWidth={2.6} />
        </span>
      ) : (
        <ChevronRight size={16} className={s.chevron} />
      )}
    </button>
  );
}
