import type { ReactNode } from 'react';
import s from './Section.module.css';

interface Props {
  title?: ReactNode;
  detail?: ReactNode;
  tone?: 'default' | 'danger';
  children: ReactNode;
}

/** Lista-szakasz címmel (pl. „Ma”, „Holnap”) és elválasztókkal tagolt sorokkal. */
export function Section({ title, detail, tone = 'default', children }: Props) {
  return (
    <section className={s.section}>
      {title && (
        <h2 className={`${s.title} ${tone === 'danger' ? s.danger : ''}`}>
          {title}
          {detail && <span className={s.detail}>{detail}</span>}
        </h2>
      )}
      <div className={s.rows}>{children}</div>
    </section>
  );
}
