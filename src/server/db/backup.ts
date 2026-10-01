import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './index.ts';

const KEEP = 30;
/** Ennél frissebb mentés mellett nem készül új (fejlesztéskor a szerver percenként újraindulhat). */
const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface BackupInfo {
  name: string;
  size: number;
  created: string;
}

/** Az adatbázis mentései a legrégebbitől a legújabbig. */
function backupFiles(backupDir: string, name: string): string[] {
  if (!existsSync(backupDir)) return [];
  const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{8}-\\d{6}\\.db$`);
  return readdirSync(backupDir)
    .filter((f) => pattern.test(f))
    .sort();
}

const pad = (n: number) => String(n).padStart(2, '0');
const stampOf = (t: Date) =>
  `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;

/**
 * Konzisztens másolat az adatbázisról (WAL mellett is biztonságos).
 * A fájlnév az adatbázis nevével kezdődik (pl. garden-20260930-192629.db), és
 * adatbázisonként az utolsó 30 marad meg – így a homokozó mentései nem szorítják ki az élesekét.
 * Visszaadja az új mentés útvonalát, vagy null-t, ha a legutóbbi még elég friss
 * (`force` esetén mindenképp készül: kézi mentéskor és visszatöltés előtt).
 */
export function backupDatabase(db: DB, backupDir: string, name = 'garden', now = new Date(), force = false): string | null {
  mkdirSync(backupDir, { recursive: true });
  const latest = backupFiles(backupDir, name).at(-1);
  if (!force && latest && now.getTime() - statSync(join(backupDir, latest)).mtimeMs < MIN_INTERVAL_MS) return null;

  // Ugyanabban a másodpercben készült mentést nem írjuk felül (pl. kézi mentés indulás után)
  let t = now;
  let target = join(backupDir, `${name}-${stampOf(t)}.db`);
  while (existsSync(target)) {
    t = new Date(t.getTime() + 1000);
    target = join(backupDir, `${name}-${stampOf(t)}.db`);
  }
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);

  const backups = backupFiles(backupDir, name);
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
    rmSync(join(backupDir, old));
  }
  return target;
}

/** A mentések a legújabbal kezdve. */
export function listBackups(backupDir: string, name = 'garden'): BackupInfo[] {
  return backupFiles(backupDir, name)
    .reverse()
    .map((f) => {
      const st = statSync(join(backupDir, f));
      return { name: f, size: st.size, created: st.mtime.toISOString() };
    });
}
