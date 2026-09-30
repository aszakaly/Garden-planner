import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import s from './Detail.module.css';

/** Adatlap-elemek: tényrács, címmel ellátott blokk, „+ Új …” gomb. */

export function FactGrid({ children }: { children: ReactNode }) {
  return <div className={s.facts}>{children}</div>;
}

export function Fact({ label, value, detail }: { label: string; value?: ReactNode; detail?: ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className={s.fact}>
      <span className={s.factLabel}>{label}</span>
      <span className={empty ? `${s.factValue} ${s.factEmpty}` : s.factValue}>{empty ? '—' : value}</span>
      {detail && <span className={s.factDetail}>{detail}</span>}
    </div>
  );
}

export function Block({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.block}>
      <header className={s.blockHeader}>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={s.addButton} onClick={onClick}>
      <Plus size={15} strokeWidth={2.6} />
      {children}
    </button>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className={s.muted}>{children}</p>;
}
