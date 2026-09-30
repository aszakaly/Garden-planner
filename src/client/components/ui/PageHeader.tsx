import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useIsMobile } from '../../lib/useIsMobile.ts';
import s from './PageHeader.module.css';

interface Props {
  title: string;
  color?: string;
  count?: number | string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/**
 * Eszköztár + nagy cím. Ha a nagy cím kigördül, a kis cím megjelenik az eszköztárban
 * (mint az Apple alkalmazásokban). Telefonon vissza gomb a listákhoz.
 */
export function PageHeader({ title, color = 'var(--label)', count, subtitle, actions }: Props) {
  const isMobile = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCompact(!e!.isIntersecting), {
      rootMargin: '-52px 0px 0px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div className={`${s.toolbar} ${compact ? s.scrolled : ''}`}>
        <div className={s.leading}>
          {isMobile && (
            <Link to="/" className={s.back}>
              <ChevronLeft size={24} strokeWidth={2.4} />
              Listák
            </Link>
          )}
        </div>
        <div className={s.compactTitle} aria-hidden={!compact}>
          {title}
        </div>
        <div className={s.actions}>{actions}</div>
      </div>
      <header className={s.header} style={{ '--c': color } as CSSProperties}>
        <h1 ref={titleRef} className={s.title}>
          {title}
        </h1>
        {count !== undefined && <span className={s.count}>{count}</span>}
      </header>
      {subtitle && <div className={s.subtitle}>{subtitle}</div>}
    </>
  );
}

interface ToolbarButtonProps {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}

export function ToolbarButton({ label, onClick, children }: ToolbarButtonProps) {
  return (
    <button type="button" className={s.toolButton} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}
