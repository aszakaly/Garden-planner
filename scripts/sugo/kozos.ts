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

const healthy = async () => {
  try {
    return (await fetch(`${BASE}/api/health`)).ok;
  } catch {
    return false;
  }
};

/** Saját szerver a :4361-en üres data/sugo/garden.db-vel, betöltött mintakerttel. */
export async function startServer(season: boolean) {
  await stopServer();
  // Ha a porton már fut valami (pl. egy félbeszakadt futás szervere), az új nem indulna el,
  // és a mintakert a régi adatbázisba kerülne másodszor is
  if (await healthy()) throw new Error(`A ${PORT}-es porton már fut egy szerver; állítsd le, és futtasd újra.`);
  rmSync('data/sugo', { recursive: true, force: true });
  let log = '';
  const proc = spawn('npx', ['tsx', 'src/server/index.ts'], {
    env: { ...process.env, KERT_PORT: String(PORT), KERT_DB: 'data/sugo/garden.db', NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout!.on('data', (d) => (log += d));
  proc.stderr!.on('data', (d) => (log += d));
  server = proc;
  for (let i = 0; i < 60 && !(await healthy()); i++) {
    if (proc.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await healthy())) {
    await stopServer();
    throw new Error(`A mintakert-szerver nem indult el.\n${log.trim()}`);
  }
  await loadSampleGarden(BASE, { season });
}

export async function stopServer() {
  if (!server) return;
  const s = server;
  server = null;
  if (s.exitCode !== null) return;
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
