import { z } from 'zod';
import type { DB } from './index.ts';
import { transaction } from './index.ts';
import { HttpError } from './helpers.ts';

/**
 * JSON export és visszatöltés: az összes adat egyetlen, ember által is olvasható fájlban.
 * A visszatöltés teljes csere – előtte a hívó automatikus mentést készít.
 */

export const EXPORT_FORMAT = 'kerttervezo-export';

/** A táblák függőségi sorrendben: visszatöltéskor ebben a sorrendben írjuk őket. */
export const EXPORT_TABLES = [
  'settings',
  'plant_family',
  'crop_group',
  'plant',
  'variety',
  'growing_window',
  'companion',
  'seed_stock',
  'garden',
  'bed',
  'plan_year',
  'planting',
  'task_state',
  'custom_task',
  'journal_entry',
] as const;

type Value = string | number | null;
type Row = Record<string, Value>;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  /** A legutóbbi lefutott migráció (pl. '003_carry_over.sql') */
  schema: string;
  exported_at: string;
  tables: Record<string, Row[]>;
}

const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT, { message: 'Ez nem a Kerttervező mentésfájlja.' }),
  schema: z.string(),
  exported_at: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])))),
});

const latestMigration = (db: DB) =>
  String((db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: string | null }).v ?? '');

const columnsOf = (db: DB, table: string) =>
  new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));

export function exportData(db: DB, now = new Date()): ExportFile {
  const tables: Record<string, Row[]> = {};
  for (const t of EXPORT_TABLES) tables[t] = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all() as Row[];
  return { format: EXPORT_FORMAT, schema: latestMigration(db), exported_at: now.toISOString(), tables };
}

export type ImportCounts = Partial<Record<(typeof EXPORT_TABLES)[number], number>>;

/**
 * Az adatbázis tartalmának cseréje a fájl tartalmára. Régebbi változatú fájl is betölthető
 * (a hiányzó oszlopok alapértéket kapnak, az ismeretlenek kimaradnak); újabb változatú nem.
 */
export function importData(db: DB, input: unknown): ImportCounts {
  const parsed = exportFileSchema.safeParse(input);
  if (!parsed.success) {
    const formatIssue = parsed.error.issues.find((i) => i.path[0] === 'format');
    throw new HttpError(400, formatIssue?.message ?? 'A fájl nem érvényes Kerttervező-mentés.');
  }
  const file = parsed.data;
  if (file.schema > latestMigration(db)) {
    throw new HttpError(400, 'A fájl a program egy újabb változatával készült – előbb frissítsd a programot.');
  }

  return transaction(db, () => {
    // Az idegen kulcsokat a tranzakció végén ellenőrizzük (a sorrend így nem számít)
    db.exec('PRAGMA defer_foreign_keys = ON');
    for (const t of [...EXPORT_TABLES].reverse()) db.exec(`DELETE FROM ${t}`);

    const counts: ImportCounts = {};
    for (const t of EXPORT_TABLES) {
      const rows = file.tables[t] ?? [];
      const columns = columnsOf(db, t);
      const statements = new Map<string, ReturnType<DB['prepare']>>();
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => columns.has(k));
        if (!keys.length) continue;
        const sig = keys.join(',');
        let stmt = statements.get(sig);
        if (!stmt) {
          stmt = db.prepare(`INSERT INTO ${t} (${sig}) VALUES (${keys.map(() => '?').join(', ')})`);
          statements.set(sig, stmt);
        }
        try {
          stmt.run(...keys.map((k) => row[k] ?? null));
        } catch (err) {
          throw new HttpError(400, `Hibás sor a(z) ${t} táblában: ${(err as Error).message}`);
        }
      }
      counts[t] = rows.length;
    }

    db.exec("INSERT INTO journal_fts(journal_fts) VALUES ('rebuild')");
    const broken = db.prepare('PRAGMA foreign_key_check').all();
    if (broken.length) throw new HttpError(400, `A fájlban ${broken.length} hibás hivatkozás van – a visszatöltés elmaradt.`);
    return counts;
  });
}
