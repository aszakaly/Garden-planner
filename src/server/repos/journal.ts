import type { DB } from '../db/index.ts';
import { HttpError, insert, notFound, remove, update } from '../db/helpers.ts';
import { entryContextText, ftsQuery, matchesAllTokens, normalizeTags } from '../../shared/domain/journal.ts';
import type { JournalType } from '../../shared/labels.ts';
import type { JournalInput } from '../../shared/schemas.ts';
import type { JournalEntry } from '../../shared/types.ts';

const bad = (message: string) => new HttpError(400, message);

const SELECT = `
  SELECT j.*, pl.name_hu AS plant_name, v.name AS variety_name, b.name AS bed_name, b.color AS bed_color,
         p.year AS planting_year
  FROM journal_entry j
  LEFT JOIN plant pl ON pl.id = j.plant_id
  LEFT JOIN variety v ON v.id = j.variety_id
  LEFT JOIN bed b ON b.id = j.bed_id
  LEFT JOIN planting p ON p.id = j.planting_id`;

export interface JournalFilter {
  q?: string;
  type?: JournalType;
  plantingId?: number;
  plantId?: number;
  varietyId?: number;
  bedId?: number;
  year?: number;
  from?: string;
  to?: string;
}

/**
 * Naplóbejegyzések a szűrők szerint, a legfrissebb elöl. A keresés a szövegben és a
 * címkékben teljes szöveges indexszel (ékezet nélkül is) fut, a kapcsolt nevekben
 * (növény, fajta, ágyás) szó eleji egyezéssel.
 */
export function listJournal(db: DB, f: JournalFilter = {}): JournalEntry[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const add = (sql: string, ...values: (string | number)[]) => {
    where.push(sql);
    params.push(...values);
  };
  if (f.type) add('j.entry_type = ?', f.type);
  if (f.plantingId) add('j.planting_id = ?', f.plantingId);
  if (f.plantId) add('j.plant_id = ?', f.plantId);
  if (f.varietyId) add('j.variety_id = ?', f.varietyId);
  if (f.bedId) add('j.bed_id = ?', f.bedId);
  if (f.year) add('j.entry_date BETWEEN ? AND ?', `${f.year}-01-01`, `${f.year}-12-31`);
  if (f.from) add('j.entry_date >= ?', f.from);
  if (f.to) add('j.entry_date <= ?', f.to);

  const rows = db
    .prepare(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY j.entry_date DESC, j.id DESC`)
    .all(...params) as unknown as JournalEntry[];
  if (!f.q?.trim()) return rows;

  const fts = ftsQuery(f.q);
  let hits = new Set<number>();
  if (fts) {
    try {
      hits = new Set(
        (db.prepare('SELECT rowid AS id FROM journal_fts WHERE journal_fts MATCH ?').all(fts) as { id: number }[]).map((r) => r.id),
      );
    } catch {
      // Érvénytelen kifejezés: csak a nevekben keresünk
    }
  }
  return rows.filter((e) => hits.has(e.id) || matchesAllTokens(entryContextText(e), f.q!));
}

export function getJournalEntry(db: DB, id: number): JournalEntry {
  const row = db.prepare(`${SELECT} WHERE j.id = ?`).get(id);
  if (!row) throw notFound('A bejegyzés');
  return row as unknown as JournalEntry;
}

export function countJournal(db: DB, year?: number): number {
  const row = year
    ? db.prepare('SELECT COUNT(*) AS n FROM journal_entry WHERE entry_date BETWEEN ? AND ?').get(`${year}-01-01`, `${year}-12-31`)
    : db.prepare('SELECT COUNT(*) AS n FROM journal_entry').get();
  return Number((row as { n: number }).n);
}

/**
 * Kapcsolatok egységesítése: ültetésnél a növény, a fajta és az ágyás az ültetésből jön;
 * fajtánál a növény a fajtából.
 */
function normalize(db: DB, input: JournalInput) {
  const out = { ...input, tags: normalizeTags(input.tags ?? '') };
  if (out.planting_id) {
    const p = db
      .prepare('SELECT plant_id, variety_id, COALESCE(actual_bed_id, bed_id) AS bed_id FROM planting WHERE id = ?')
      .get(out.planting_id) as { plant_id: number; variety_id: number | null; bed_id: number | null } | undefined;
    if (!p) throw bad('Az ültetés nem található.');
    out.plant_id = p.plant_id;
    out.variety_id = p.variety_id;
    out.bed_id = p.bed_id ?? out.bed_id ?? null;
  } else if (out.variety_id) {
    const v = db.prepare('SELECT plant_id FROM variety WHERE id = ?').get(out.variety_id) as { plant_id: number } | undefined;
    if (!v) throw bad('A fajta nem található.');
    out.plant_id = v.plant_id;
  }
  if (out.plant_id && !db.prepare('SELECT 1 FROM plant WHERE id = ?').get(out.plant_id)) throw bad('A növény nem található.');
  if (out.bed_id && !db.prepare('SELECT 1 FROM bed WHERE id = ?').get(out.bed_id)) throw bad('Az ágyás nem található.');
  // A hiányzó mezők üresek legyenek (teljes csere), ne maradjon meg a korábbi érték
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

const EMPTY_LINKS = { planting_id: null, plant_id: null, variety_id: null, bed_id: null, amount: null, unit: null, quality: null };

export function createJournalEntry(db: DB, input: JournalInput): JournalEntry {
  return getJournalEntry(db, insert(db, 'journal_entry', { ...EMPTY_LINKS, ...normalize(db, input) }));
}

export function updateJournalEntry(db: DB, id: number, input: JournalInput): JournalEntry {
  const data = { ...EMPTY_LINKS, ...normalize(db, input), updated_at: new Date().toISOString() };
  if (!update(db, 'journal_entry', id, data)) throw notFound('A bejegyzés');
  return getJournalEntry(db, id);
}

export function deleteJournalEntry(db: DB, id: number): void {
  if (!remove(db, 'journal_entry', id)) throw notFound('A bejegyzés');
}
