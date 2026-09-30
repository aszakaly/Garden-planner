import { Outlet, useLocation } from 'react-router';
import { useIsMobile } from '../lib/useIsMobile.ts';
import { Sidebar } from './Sidebar.tsx';
import s from './AppLayout.module.css';

export function AppLayout() {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();

  if (isMobile) {
    return pathname === '/' ? (
      <Sidebar />
    ) : (
      <main className={s.main}>
        <Outlet />
      </main>
    );
  }

  return (
    <div className={s.app}>
      <Sidebar />
      <main className={s.main}>
        <Outlet />
      </main>
    </div>
  );
}
