import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import s from './IconCircle.module.css';

interface Props {
  icon: LucideIcon;
  color: string;
  size?: number;
}

/** Színes kör fehér ikonnal – az Emlékeztetők listaikonjai mintájára. */
export function IconCircle({ icon: Icon, color, size = 26 }: Props) {
  const style = { '--c': color, width: size, height: size } as CSSProperties;
  return (
    <span className={s.circle} style={style} aria-hidden>
      <Icon size={Math.round(size * 0.56)} strokeWidth={2.5} />
    </span>
  );
}
