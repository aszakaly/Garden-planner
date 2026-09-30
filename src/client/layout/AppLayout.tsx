import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useIsMobile } from '../lib/useIsMobile.ts';
import { Sidebar } from './Sidebar.tsx';
import s from './AppLayout.module.css';

export function AppLayout() {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Új oldalra lépve a tartalom a tetejéről induljon
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [pathname]);

  if (isMobile) {
    return pathname === '/' ? (
      <Sidebar />
    ) : (
      <main ref={mainRef} className={s.main}>
        <Outlet />
      </main>
    );
  }

  return (
    <div className={s.app}>
      <Sidebar />
      <main ref={mainRef} className={s.main}>
        <Outlet />
      </main>
    </div>
  );
}
