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
  children: ReactNode;
}

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
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // A billentyűkezelő mindig a legfrissebb függvényeket lássa, de a hatás csak nyitáskor fusson le:
  // különben minden leütés utáni újrarenderelés visszaugratná a fókuszt az első mezőre.
  const latest = useRef({ onClose, onConfirm, confirmDisabled });
  latest.current = { onClose, onConfirm, confirmDisabled };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const { onClose, onConfirm, confirmDisabled } = latest.current;
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onConfirm && !confirmDisabled) onConfirm();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className={s.panel} role="dialog" aria-modal="true" aria-label={title}>
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
