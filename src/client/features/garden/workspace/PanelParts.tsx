import { X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import s from './Workspace.module.css';

/** A panel fejléce: felső címke, cím, leírás, és opcionálisan a kijelölés megszüntetése. */
export function PanelHead({
  kicker,
  title,
  meta,
  color,
  onClose,
}: {
  kicker: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** A cím előtti pötty színe (a sáv zöldségcsoportja) */
  color?: string;
  onClose?: () => void;
}) {
  return (
    <div className={s.head}>
      <div className={s.headText}>
        <div className={s.kicker}>{kicker}</div>
        <h2 className={s.title} style={color ? ({ '--sc': color } as CSSProperties) : undefined}>
          {color && <span className={s.titleDot} />}
          {title}
        </h2>
        {meta && <div className={s.meta}>{meta}</div>}
      </div>
      {onClose && (
        <button type="button" className={s.close} aria-label="Kijelölés megszüntetése" title="Kijelölés megszüntetése (Esc)" onClick={onClose}>
          <X size={15} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

/** Címmel ellátott csoport a panelen. */
export function PanelGroup({ title, children, plain }: { title?: ReactNode; children: ReactNode; plain?: boolean }) {
  return (
    <section>
      {title && <h3 className={s.groupTitle}>{title}</h3>}
      {plain ? <div className={s.notices}>{children}</div> : <div className={s.group}>{children}</div>}
    </section>
  );
}
