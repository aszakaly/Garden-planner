import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CheckLevel } from '@shared/labels.ts';
import s from './Notice.module.css';

const ICON = { info: Info, figyelem: TriangleAlert, kerulendo: CircleAlert } as const;

/** Rövid jelzés ikonnal (tájékoztató, figyelmeztetés, kerülendő). */
export function Notice({ level, children }: { level: CheckLevel; children: ReactNode }) {
  const Icon = ICON[level];
  return (
    <div className={`${s.notice} ${s[level]}`}>
      <Icon size={15} strokeWidth={2.4} className={s.icon} />
      <span>{children}</span>
    </div>
  );
}

/** Jelzések listája űrlapcsoport alatt. */
export function NoticeList({ items }: { items: { level: CheckLevel; message: ReactNode }[] }) {
  if (!items.length) return null;
  return (
    <div className={s.list}>
      {items.map((i, n) => (
        <Notice key={n} level={i.level}>
          {i.message}
        </Notice>
      ))}
    </div>
  );
}
