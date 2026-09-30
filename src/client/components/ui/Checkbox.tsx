import type { CSSProperties } from 'react';
import s from './Checkbox.module.css';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: string;
  label: string;
}

/** Az Emlékeztetők kör alakú pipálója: üres kör → színes gyűrű + pötty. */
export function Checkbox({ checked, onChange, color = 'var(--c-blue)', label }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`${s.box} ${checked ? s.checked : ''}`}
      style={{ '--c': color } as CSSProperties}
      onClick={() => onChange(!checked)}
    >
      <span className={s.dot} />
    </button>
  );
}
