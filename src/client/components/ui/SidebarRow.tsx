import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { IconCircle } from './IconCircle.tsx';
import s from './SidebarRow.module.css';

interface Props {
  to: string;
  icon: LucideIcon;
  color: string;
  label: string;
  count?: number;
}

export function SidebarRow({ to, icon, color, label, count }: Props) {
  return (
    <NavLink to={to} className={({ isActive }) => `${s.row} ${isActive ? s.active : ''}`}>
      <IconCircle icon={icon} color={color} size={24} />
      <span className={s.label}>{label}</span>
      {count !== undefined && <span className={s.count}>{count}</span>}
      <span className={s.chevron} aria-hidden>
        ›
      </span>
    </NavLink>
  );
}
