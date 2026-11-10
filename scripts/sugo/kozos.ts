/** A Súgó képernyőkép- és videószkriptjének közös részei: a mintakert-szerver és a segédek. */
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { loadSampleGarden } from './mintakert.ts';

export const PORT = 4361;
export const BASE = `http://localhost:${PORT}`;
/** A tervezés napja (asztali jelenetek) és a szezon napja (telefonos jelenetek). */
export const PLANNING_DAY = new Date('2027-02-15T09:00:00');
export const SEASON_DAY = new Date('2027-05-10T08:30:00');

let server: ChildProcess | null = null;

/** Saját szerver a :4361-en üres data/sugo/garden.db-vel, betöltött mintakerttel. */
export async function startServer(season: boolean) {
  await stopServer();
  rmSync('data/sugo', { recursive: true, force: true });
  server = spawn('npx', ['tsx', 'src/server/index.ts'], {
    env: { ...process.env, KERT_PORT: String(PORT), KERT_DB: 'data/sugo/garden.db', NODE_ENV: 'production' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      /* még indul */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await loadSampleGarden(BASE, { season });
}

export async function stopServer() {
  if (!server) return;
  const s = server;
  server = null;
  await new Promise<void>((resolve) => {
    s.once('exit', () => resolve());
    s.kill();
  });
}

export const dialog = (scope: Page | Locator, name: string) => scope.getByRole('dialog', { name, exact: true });

/** Űrlapmező a sor felirata alapján (mint az e2e tesztben). */
export const field = (scope: Locator, label: string) =>
  scope
    .locator('label')
    .filter({ has: scope.page().getByText(label, { exact: true }) })
    .locator('input, select, textarea')
    .first();
