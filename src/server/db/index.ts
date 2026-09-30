import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DB = DatabaseSync;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function openDatabase(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

export function migrate(db: DB, dir = MIGRATIONS_DIR): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => String(r.version)),
  );
  const pending = readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !applied.has(f))
    .sort();
  if (!pending.length) return pending;

  // A táblák újraépítése (pl. CHECK-feltétel módosítása) csak kikapcsolt idegenkulcs-ellenőrzéssel
  // biztonságos: különben a régi tábla eldobása lenullázná a rá mutató hivatkozásokat.
  // A kapcsoló tranzakción belül hatástalan, ezért itt, kívül állítjuk.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (const file of pending) {
      const sql = readFileSync(join(dir, file), 'utf8');
      transaction(db, () => {
        db.exec(sql);
        const broken = db.prepare('PRAGMA foreign_key_check').all();
        if (broken.length) {
          throw new Error(`A(z) ${file} migráció után ${broken.length} hibás hivatkozás maradt – visszavonva.`);
        }
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
          file,
          new Date().toISOString(),
        );
      });
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  return pending;
}

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
