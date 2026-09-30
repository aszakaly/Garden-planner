import type { CSSProperties } from 'react';
import { LIST_COLOR_NAMES, type ListColorName } from '@shared/labels.ts';
import { colorVar } from '../../lib/colors.ts';
import s from './ColorPicker.module.css';

const NAMES: Record<ListColorName, string> = {
  red: 'piros', orange: 'narancs', yellow: 'sárga', green: 'zöld', mint: 'menta', teal: 'kékeszöld', cyan: 'cián',
  blue: 'kék', indigo: 'indigó', purple: 'lila', pink: 'rózsaszín', brown: 'barna', gray: 'szürke',
};

/** Emlékeztetők-stílusú színválasztó körök. */
export function ColorPicker({ value, onChange }: { value: ListColorName; onChange: (c: ListColorName) => void }) {
  return (
    <div className={s.picker} role="radiogroup" aria-label="Szín">
      {LIST_COLOR_NAMES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={NAMES[c]}
          title={NAMES[c]}
          className={`${s.swatch} ${c === value ? s.selected : ''}`}
          style={{ '--c': colorVar(c) } as CSSProperties}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}
