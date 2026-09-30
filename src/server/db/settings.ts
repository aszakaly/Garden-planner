import type { DB } from './index.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings.ts';

export function getSettings(db: DB): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = Object.fromEntries(rows.map((r) => [String(r.key), String(r.value)]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function updateSettings(db: DB, patch: Partial<Settings>): Settings {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) upsert.run(key, String(value));
  }
  return getSettings(db);
}
