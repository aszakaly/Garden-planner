import type { DB } from '../db/index.ts';
import { transaction } from '../db/index.ts';
import { HttpError, insert, notFound, remove, update } from '../db/helpers.ts';
import { seedViability } from '../../shared/domain/seeds.ts';
import type { SeedStockInput } from '../../shared/schemas.ts';
import type { SeedStockListItem } from '../../shared/types.ts';

type Row = Record<string, unknown>;

const SELECT = `
  SELECT s.*, v.name AS variety_name, p.id AS plant_id, p.name_hu AS plant_name, p.seed_viability_years
  FROM seed_stock s
  JOIN variety v ON v.id = s.variety_id
  JOIN plant p ON p.id = v.plant_id`;

function mapSeed(r: Row, currentYear: number): SeedStockListItem {
  const item = r as unknown as SeedStockListItem;
  return {
    ...item,
    in_stock: r.in_stock === 1,
    viability: seedViability(item.vintage_year, item.seed_viability_years, currentYear),
  };
}

export function listSeeds(db: DB, currentYear = new Date().getFullYear()): SeedStockListItem[] {
  return db
    .prepare(`${SELECT} ORDER BY p.name_hu COLLATE NOCASE, v.name COLLATE NOCASE, s.vintage_year DESC`)
    .all()
    .map((r) => mapSeed(r, currentYear));
}

export function getSeed(db: DB, id: number, currentYear = new Date().getFullYear()): SeedStockListItem {
  const row = db.prepare(`${SELECT} WHERE s.id = ?`).get(id);
  if (!row) throw notFound('A vetőmagtétel');
  return mapSeed(row, currentYear);
}

/** A megadott fajta azonosítója; ha csak növény + név jött, meglévőt keres vagy újat hoz létre. */
function resolveVariety(db: DB, input: SeedStockInput): number {
  if (input.variety_id) {
    if (!db.prepare('SELECT 1 FROM variety WHERE id = ?').get(input.variety_id)) throw notFound('A fajta');
    return input.variety_id;
  }
  const plantId = input.plant_id!;
  if (!db.prepare('SELECT 1 FROM plant WHERE id = ?').get(plantId)) throw notFound('A növény');
  // Az SQLite NOCASE csak ASCII-t hasonlít kis/nagybetű-függetlenül (Ö ≠ ö), ezért itt végezzük
  const wanted = input.variety_name!.trim().toLocaleLowerCase('hu');
  const existing = (
    db.prepare('SELECT id, name FROM variety WHERE plant_id = ?').all(plantId) as { id: number; name: string }[]
  ).find((v) => v.name.trim().toLocaleLowerCase('hu') === wanted);
  return existing?.id ?? insert(db, 'variety', { plant_id: plantId, name: input.variety_name });
}

function stockFields(input: SeedStockInput) {
  const { variety_id: _v, plant_id: _p, variety_name: _n, ...fields } = input;
  return fields;
}

export function createSeed(db: DB, input: SeedStockInput): SeedStockListItem {
  const id = transaction(db, () =>
    insert(db, 'seed_stock', { ...stockFields(input), variety_id: resolveVariety(db, input) }),
  );
  return getSeed(db, id);
}

export function updateSeed(db: DB, id: number, input: SeedStockInput): SeedStockListItem {
  transaction(db, () => {
    if (!update(db, 'seed_stock', id, { ...stockFields(input), variety_id: resolveVariety(db, input) })) {
      throw notFound('A vetőmagtétel');
    }
  });
  return getSeed(db, id);
}

export function setSeedInStock(db: DB, id: number, inStock: boolean): SeedStockListItem {
  if (!update(db, 'seed_stock', id, { in_stock: inStock })) throw notFound('A vetőmagtétel');
  return getSeed(db, id);
}

export function deleteSeed(db: DB, id: number): void {
  const used = db.prepare('SELECT COUNT(*) AS n FROM planting WHERE seed_stock_id = ?').get(id) as { n: number };
  if (used.n > 0) {
    throw new HttpError(409, `Ez a tétel ${used.n} ültetésnél szerepel. Törlés helyett jelöld elfogyottnak.`);
  }
  if (!remove(db, 'seed_stock', id)) throw notFound('A vetőmagtétel');
}
