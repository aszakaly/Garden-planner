import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { NavLink } from 'react-router';
import { IconCircle } from './IconCircle.tsx';
import s from './SmartTile.module.css';

interface Props {
  to: string;
  icon: LucideIcon;
  color: string;
  label: string;
  count?: number;
}

/** Okoslista-csempe (Ma / Ütemezett stílus): ikon, darabszám, cím. */
export function SmartTile({ to, icon, color, label, count }: Props) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${s.tile} ${isActive ? s.active : ''}`}
      style={{ '--c': color } as CSSProperties}
    >
      <span className={s.top}>
        <span className={s.icon}>
          <IconCircle icon={icon} color={color} size={28} />
        </span>
        {count !== undefined && <span className={s.count}>{count}</span>}
      </span>
      <span className={s.label}>{label}</span>
    </NavLink>
  );
}
