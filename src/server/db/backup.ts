import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './index.ts';

const KEEP = 30;

/** Konzisztens másolat az adatbázisról (WAL mellett is biztonságos), az utolsó 30 marad meg. */
export function backupDatabase(db: DB, backupDir: string, now = new Date()): string {
  mkdirSync(backupDir, { recursive: true });
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const target = join(backupDir, `garden-${stamp}.db`);
  if (!existsSync(target)) db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);

  const backups = readdirSync(backupDir)
    .filter((f) => /^garden-\d{8}-\d{6}\.db$/.test(f))
    .sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
    rmSync(join(backupDir, old));
  }
  return target;
}
