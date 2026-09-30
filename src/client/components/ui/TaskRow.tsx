import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Checkbox } from './Checkbox.tsx';
import s from './TaskRow.module.css';

interface Props {
  title: string;
  done: boolean;
  onToggle: (done: boolean) => void;
  color?: string;
  meta?: ReactNode;
  chips?: ReactNode;
  onInfo?: () => void;
}

/** Feladat-sor: pipáló, cím, másodlagos sor (hely, dátum), címkék, ⓘ gomb hoverre. */
export function TaskRow({ title, done, onToggle, color, meta, chips, onInfo }: Props) {
  return (
    <div className={`${s.row} ${done ? s.done : ''} ${onInfo ? s.hasInfo : ''}`}>
      <div className={s.check}>
        <Checkbox checked={done} onChange={onToggle} color={color} label={title} />
      </div>
      <div className={s.body}>
        <div className={s.title}>{title}</div>
        {meta && <div className={s.meta}>{meta}</div>}
        {chips && <div className={s.chips}>{chips}</div>}
      </div>
      {onInfo && (
        <button type="button" className={s.info} onClick={onInfo} aria-label="Részletek">
          <Info size={18} />
        </button>
      )}
    </div>
  );
}
