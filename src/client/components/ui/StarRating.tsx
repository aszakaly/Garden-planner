import { Star } from 'lucide-react';
import s from './StarRating.module.css';

interface Props {
  value: number | null;
  /** Ha nincs megadva, csak megjelenít */
  onChange?: (value: number | null) => void;
  label: string;
  size?: number;
}

/** 1–5 csillagos értékelés; a kiválasztott csillagra újra kattintva törlődik. */
export function StarRating({ value, onChange, label, size = 20 }: Props) {
  if (!onChange) {
    if (!value) return null;
    return (
      <span className={s.static} role="img" aria-label={`${label}: ${value} / 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} size={size} className={i < value ? s.on : s.off} />
        ))}
      </span>
    );
  }
  return (
    <span className={s.stars} role="radiogroup" aria-label={label}>
      {Array.from({ length: 5 }, (_, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          aria-label={`${i + 1} csillag`}
          className={s.star}
          onClick={() => onChange(value === i + 1 ? null : i + 1)}
        >
          <Star size={size} className={value && i < value ? s.on : s.off} />
        </button>
      ))}
    </span>
  );
}
