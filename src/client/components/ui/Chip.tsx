import type { CSSProperties, ReactNode } from 'react';
import s from './Chip.module.css';

type Tone = 'neutral' | 'good' | 'bad' | 'warn' | 'info';

interface Props {
  children: ReactNode;
  dot?: string;
  tone?: Tone;
}

export function Chip({ children, dot, tone = 'neutral' }: Props) {
  return (
    <span className={`${s.chip} ${s[tone]}`}>
      {dot && <span className={s.dot} style={{ '--c': dot } as CSSProperties} />}
      {children}
    </span>
  );
}
