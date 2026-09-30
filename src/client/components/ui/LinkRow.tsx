import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import s from './LinkRow.module.css';

interface Props {
  to?: string;
  onClick?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  accessory?: ReactNode;
  chevron?: boolean;
}

/** Navigáló listasor: cím, alcím, jobb oldali kiegészítő (pl. mini naptár) és nyíl. */
export function LinkRow({ to, onClick, title, subtitle, leading, accessory, chevron = true }: Props) {
  const content = (
    <>
      {leading && <span className={s.leading}>{leading}</span>}
      <span className={s.body}>
        <span className={s.text}>
          <span className={s.title}>{title}</span>
          {subtitle && <span className={s.subtitle}>{subtitle}</span>}
        </span>
        {accessory && <span className={s.accessory}>{accessory}</span>}
        {chevron && <ChevronRight className={s.chevron} size={16} strokeWidth={2.4} />}
      </span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={s.row}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={s.row} onClick={onClick}>
      {content}
    </button>
  );
}
