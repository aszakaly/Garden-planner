import { Navigate, createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './layout/AppLayout.tsx';
import { useIsMobile } from './lib/useIsMobile.ts';
import { PlaceholderPage } from './pages/PlaceholderPage.tsx';
import { ThisWeekPage } from './pages/ThisWeekPage.tsx';
import { PlantsPage } from './features/plants/PlantsPage.tsx';
import { PlantDetailPage } from './features/plants/PlantDetailPage.tsx';
import { SettingsPage } from './features/settings/SettingsPage.tsx';

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
      { path: 'terv', element: <PlaceholderPage title="Éves terv" color="var(--c-green)" step="4. lépésében" /> },
      {
        path: 'figyelmeztetesek',
        element: <PlaceholderPage title="Figyelmeztetések" color="var(--c-orange)" step="5. lépésében" />,
      },
      { path: 'naplo', element: <PlaceholderPage title="Napló" color="var(--c-brown)" step="7. lépésében" /> },
      { path: 'agyas/:id', element: <PlaceholderPage title="Ágyás" color="var(--c-green)" step="3–4. lépésében" /> },
      { path: 'novenyek', element: <PlantsPage /> },
      { path: 'novenyek/:id', element: <PlantDetailPage /> },
      { path: 'vetomag', element: <PlaceholderPage title="Vetőmagkészlet" color="var(--c-purple)" step="2. lépésében" /> },
      { path: 'kert', element: <PlaceholderPage title="Kert és ágyások" color="var(--c-teal)" step="3. lépésében" /> },
      { path: 'beallitasok', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
