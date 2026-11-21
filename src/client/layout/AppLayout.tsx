import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useHealth } from '../lib/queries.ts';
import { useIsMobile } from '../lib/useDevice.ts';
import { Sidebar } from './Sidebar.tsx';
import s from './AppLayout.module.css';

export function AppLayout() {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isTest = useHealth().data?.environment === 'teszt';

  useEffect(() => {
    document.title = isTest ? 'Kerttervező – teszt' : 'Kerttervező';
  }, [isTest]);

  // Új oldalra lépve a tartalom a tetejéről induljon
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [pathname]);

  const testBadge = isTest && <div className={s.testBadge} role="status" aria-label="Teszt példány" />;

  if (isMobile) {
    return (
      <>
        {testBadge}
        {pathname === '/' ? (
          <Sidebar />
        ) : (
          <main ref={mainRef} className={s.main}>
            <Outlet />
          </main>
        )}
      </>
    );
  }

  return (
    <div className={s.app}>
      {testBadge}
      <Sidebar />
      <main ref={mainRef} className={s.main}>
        <Outlet />
      </main>
    </div>
  );
}
