import { Navigate, createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './layout/AppLayout.tsx';
import { useIsMobile } from './lib/useIsMobile.ts';
import { PlantsPage } from './features/plants/PlantsPage.tsx';
import { PlantDetailPage } from './features/plants/PlantDetailPage.tsx';
import { VarietyPage } from './features/plants/VarietyPage.tsx';
import { SettingsPage } from './features/settings/SettingsPage.tsx';
import { SeedsPage } from './features/seeds/SeedsPage.tsx';
import { GardenPage } from './features/garden/GardenPage.tsx';
import { BedPage } from './features/garden/BedPage.tsx';
import { PlanPage } from './features/plan/PlanPage.tsx';
import { WarningsPage } from './features/warnings/WarningsPage.tsx';
import { ThisWeekPage } from './features/tasks/ThisWeekPage.tsx';
import { ScheduledPage } from './features/tasks/ScheduledPage.tsx';
import { CalendarPage } from './features/calendar/CalendarPage.tsx';
import { JournalPage } from './features/journal/JournalPage.tsx';

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
      { path: 'utemezett', element: <ScheduledPage /> },
      { path: 'naptar', element: <CalendarPage /> },
      { path: 'terv', element: <PlanPage /> },
      { path: 'figyelmeztetesek', element: <WarningsPage /> },
      { path: 'naplo', element: <JournalPage /> },
      { path: 'agyas/:id', element: <BedPage /> },
      { path: 'novenyek', element: <PlantsPage /> },
      { path: 'novenyek/:id', element: <PlantDetailPage /> },
      { path: 'novenyek/:id/fajtak/:vid', element: <VarietyPage /> },
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
