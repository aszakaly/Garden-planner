import { Navigate, createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './layout/AppLayout.tsx';
import { useIsMobile } from './lib/useIsMobile.ts';
import { PlaceholderPage } from './pages/PlaceholderPage.tsx';
import { ThisWeekPage } from './pages/ThisWeekPage.tsx';
import { PlantsPage } from './features/plants/PlantsPage.tsx';
import { PlantDetailPage } from './features/plants/PlantDetailPage.tsx';
import { SettingsPage } from './features/settings/SettingsPage.tsx';
import { SeedsPage } from './features/seeds/SeedsPage.tsx';
import { GardenPage } from './features/garden/GardenPage.tsx';
import { BedPage } from './features/garden/BedPage.tsx';
import { PlanPage } from './features/plan/PlanPage.tsx';
import { WarningsPage } from './features/warnings/WarningsPage.tsx';

function Home() {
  // Asztalon a „Ez a hét” nyílik; telefonon az elrendezés a listákat mutatja.
  return useIsMobile() ? null : <Navigate to="/het" replace />;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'het', element: <ThisWeekPage /> },
      { path: 'utemezett', element: <PlaceholderPage title="Ütemezett" color="var(--c-red)" step="6. lépésében" /> },
      { path: 'naptar', element: <PlaceholderPage title="Naptár" color="var(--c-indigo)" step="6. lépésében" /> },
      { path: 'terv', element: <PlanPage /> },
      { path: 'figyelmeztetesek', element: <WarningsPage /> },
      { path: 'naplo', element: <PlaceholderPage title="Napló" color="var(--c-brown)" step="7. lépésében" /> },
      { path: 'agyas/:id', element: <BedPage /> },
      { path: 'novenyek', element: <PlantsPage /> },
      { path: 'novenyek/:id', element: <PlantDetailPage /> },
      { path: 'vetomag', element: <SeedsPage /> },
      { path: 'kert', element: <GardenPage /> },
      { path: 'beallitasok', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
