import s from './SegmentedControl.module.css';

interface Props<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label?: string;
  size?: 'regular' | 'small';
}

/** Szegmentált vezérlő (UISegmentedControl). */
export function SegmentedControl<T extends string | number>({ value, options, onChange, label, size = 'regular' }: Props<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className={`${s.control} ${size === 'small' ? s.small : ''}`}
      role="radiogroup"
      aria-label={label}
      style={{ '--count': options.length, '--index': index } as React.CSSProperties}
    >
      <span className={s.thumb} aria-hidden />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`${s.option} ${o.value === value ? s.selected : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
