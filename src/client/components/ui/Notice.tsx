import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CheckLevel } from '@shared/labels.ts';
import s from './Notice.module.css';

const ICON = { ok: CircleCheck, info: Info, figyelem: TriangleAlert, kerulendo: CircleAlert } as const;
type Level = CheckLevel | 'ok';

/** Rövid jelzés ikonnal (rendben, tájékoztató, figyelmeztetés, kerülendő). */
export function Notice({ level, children }: { level: Level; children: ReactNode }) {
  const Icon = ICON[level];
  return (
    <div className={`${s.notice} ${s[level]}`}>
      <Icon size={15} strokeWidth={2.4} className={s.icon} />
      <span>{children}</span>
    </div>
  );
}

/** Jelzések listája űrlapcsoport alatt (opcionálisan saját címmel). */
export function NoticeList({ items, title }: { items: { level: Level; message: ReactNode }[]; title?: string }) {
  if (!items.length) return null;
  return (
    <div className={s.list}>
      {title && <h3 className={s.title}>{title}</h3>}
      {items.map((i, n) => (
        <Notice key={n} level={i.level}>
          {i.message}
        </Notice>
      ))}
    </div>
  );
}
