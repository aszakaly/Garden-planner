import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './Sheet.module.css';

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  /** A jobb felső művelet (pl. „Kész”). Ha nincs megadva, csak „Bezárás” jelenik meg. */
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  error?: string | null;
  /** Szélesebb ablak asztalon (pl. a kiosztás-szerkesztőhöz); telefonon nincs különbség */
  wide?: boolean;
  children: ReactNode;
}

/** A nyitott lapok sorrendje: a billentyűket mindig csak a legfelső kezeli. */
const openSheets: symbol[] = [];

/** Apple-stílusú modális lap: asztalon középre igazított ablak, telefonon alulról felcsúszó lap. */
export function Sheet({
  title,
  open,
  onClose,
  onConfirm,
  confirmLabel = 'Kész',
  confirmDisabled,
  busy,
  error,
  wide,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // A billentyűkezelő mindig a legfrissebb függvényeket lássa, de a hatás csak nyitáskor fusson le:
  // különben minden leütés utáni újrarenderelés visszaugratná a fókuszt az első mezőre.
  const latest = useRef({ onClose, onConfirm, confirmDisabled, busy });
  latest.current = { onClose, onConfirm, confirmDisabled, busy };

  useEffect(() => {
    if (!open) return;
    const id = Symbol('sheet');
    openSheets.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (openSheets.at(-1) !== id) return;
      const { onClose, onConfirm, confirmDisabled, busy } = latest.current;
      if (e.key === 'Escape') onClose();
      // Mentés közben ne küldje el újra (a gombhoz hasonlóan): különben pl. a tömeges ágyásfelvétel kétszer futna le
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onConfirm && !confirmDisabled && !busy) onConfirm();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus();
    return () => {
      openSheets.splice(openSheets.indexOf(id), 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className={wide ? `${s.panel} ${s.wide}` : s.panel} role="dialog" aria-modal="true" aria-label={title}>
        <header className={s.header}>
          <button type="button" className={s.cancel} onClick={onClose}>
            {onConfirm ? 'Mégse' : 'Bezárás'}
          </button>
          <h2 className={s.title}>{title}</h2>
          {onConfirm ? (
            <button
              type="button"
              className={s.confirm}
              onClick={onConfirm}
              disabled={confirmDisabled || busy}
            >
              {busy ? 'Mentés…' : confirmLabel}
            </button>
          ) : (
            <span />
          )}
        </header>
        <div className={s.body}>
          {error && <div className={s.error}>{error}</div>}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
