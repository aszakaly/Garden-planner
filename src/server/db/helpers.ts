import type { SQLInputValue } from 'node:sqlite';
import type { DB } from './index.ts';

type Row = Record<string, unknown>;

/** JS érték → SQLite-kompatibilis érték (undefined → null, boolean → 0/1, tömb/objektum → JSON). */
function toSql(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object' && !(value instanceof Uint8Array)) return JSON.stringify(value);
  return value as SQLInputValue;
}

export function insert(db: DB, table: string, data: Row): number {
  const keys = Object.keys(data);
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  const result = db.prepare(sql).run(...keys.map((k) => toSql(data[k])));
  return Number(result.lastInsertRowid);
}

/** Részleges frissítés; csak a megadott (nem undefined) mezőket írja. Visszaadja, hogy volt-e érintett sor. */
export function update(db: DB, table: string, id: number, data: Row, idColumn = 'id'): boolean {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (!keys.length) return exists(db, table, id, idColumn);
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${idColumn} = ?`;
  const result = db.prepare(sql).run(...keys.map((k) => toSql(data[k])), id);
  return Number(result.changes) > 0;
}

export function remove(db: DB, table: string, id: number): boolean {
  return Number(db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes) > 0;
}

export function exists(db: DB, table: string, id: number, idColumn = 'id'): boolean {
  return !!db.prepare(`SELECT 1 FROM ${table} WHERE ${idColumn} = ?`).get(id);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Az elem') => new HttpError(404, `${what} nem található`);
