import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './index.ts';

const KEEP = 30;
/** Ennél frissebb mentés mellett nem készül új (fejlesztéskor a szerver percenként újraindulhat). */
const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Konzisztens másolat az adatbázisról (WAL mellett is biztonságos).
 * A fájlnév az adatbázis nevével kezdődik (pl. garden-20260930-192629.db), és
 * adatbázisonként az utolsó 30 marad meg – így a homokozó mentései nem szorítják ki az élesekét.
 * Visszaadja az új mentés útvonalát, vagy null-t, ha a legutóbbi még elég friss.
 */
export function backupDatabase(db: DB, backupDir: string, name = 'garden', now = new Date()): string | null {
  mkdirSync(backupDir, { recursive: true });
  const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{8}-\\d{6}\\.db$`);
  const existing = () =>
    readdirSync(backupDir)
      .filter((f) => pattern.test(f))
      .sort();

  const latest = existing().at(-1);
  if (latest && now.getTime() - statSync(join(backupDir, latest)).mtimeMs < MIN_INTERVAL_MS) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const target = join(backupDir, `${name}-${stamp}.db`);
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);

  const backups = existing();
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
    rmSync(join(backupDir, old));
  }
  return target;
}
