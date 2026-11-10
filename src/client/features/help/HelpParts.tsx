import { useEffect, useState, type ReactNode } from 'react';
import sizes from './shotSizes.json';
import s from './HelpPage.module.css';

/** A Súgó képei és videója a `public/sugo/` mappában vannak. */
export const helpAsset = (file: string) => `/sugo/${file}`;

interface ChapterProps {
  id: string;
  title: string;
  /** Egy-két mondat: mire jó a fejezet, mikor veszed elő */
  intro: ReactNode;
  children: ReactNode;
}

export function Chapter({ id, title, intro, children }: ChapterProps) {
  return (
    <section id={id} className={s.chapter} aria-labelledby={`${id}-cim`}>
      <h2 id={`${id}-cim`} className={s.chapterTitle}>
        {title}
      </h2>
      <p className={s.intro}>{intro}</p>
      {children}
    </section>
  );
}

/** Egy lépés: rövid cím, egy-két bekezdés, alatta a képek. */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className={s.step}>
      <h3 className={s.stepTitle}>
        <span className={s.stepNo} aria-hidden>
          {n}
        </span>
        {title}
      </h3>
      <div className={s.stepBody}>{children}</div>
    </div>
  );
}

/** Rövid kiemelés: fogalom vagy jó tanács. */
export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className={s.note}>
      <strong>{title}</strong> {children}
    </aside>
  );
}

interface ShotProps {
  file: string;
  alt: string;
  /** Telefonos képernyőkép: keskenyebben, középre igazítva */
  phone?: boolean;
  caption?: ReactNode;
}

/** Képernyőkép; koppintásra teljes képernyőn nyílik meg. */
export function Shot({ file, alt, phone, caption }: ShotProps) {
  const [open, setOpen] = useState(false);
  const [width, height] = (sizes as Record<string, number[]>)[file] ?? [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <figure className={`${s.shot} ${phone ? s.phone : ''}`}>
      <button type="button" className={s.shotButton} onClick={() => setOpen(true)} aria-label={`${alt} – nagyítás`}>
        <img src={helpAsset(file)} alt={alt} width={width} height={height} loading="lazy" />
      </button>
      {caption && <figcaption>{caption}</figcaption>}
      {open && (
        <div className={s.lightbox} role="dialog" aria-label={alt} onClick={() => setOpen(false)}>
          {/* Eredeti méretben (a képek 2× felbontásúak): telefonon a széles kép ujjal görgethető */}
          <div className={s.lightboxScroll}>
            <img src={helpAsset(file)} alt={alt} style={width ? { width: width / 2 } : undefined} />
          </div>
          <span className={s.lightboxHint}>Húzással mozgathatod, koppintással bezárod</span>
        </div>
      )}
    </figure>
  );
}
