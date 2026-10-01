import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DB } from './db/index.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';
import type { ExportFile } from './db/exchange.ts';
import type { Bed, PlantListItem } from '../shared/types.ts';

let db: DB;
let app: FastifyInstance;
let dir: string;
let exported: ExportFile;

const count = (table: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

beforeAll(async () => {
  db = openDatabase(':memory:');
  seedIfEmpty(db);
  dir = mkdtempSync(join(tmpdir(), 'kert-data-'));
  app = buildApp({ db, backup: { dir, name: 'garden' } });
  const plants: PlantListItem[] = (await app.inject({ url: '/api/plants' })).json();
  const bed: Bed = (await app.inject({ method: 'POST', url: '/api/beds', payload: { name: 'Régi ágyás', length_cm: 200, width_cm: 100 } })).json();
  await app.inject({
    method: 'POST',
    url: '/api/plantings',
    payload: { year: 2026, plant_id: plants[0]!.id, bed_id: bed.id, is_history: true },
  });
  await app.inject({ method: 'POST', url: '/api/journal', payload: { entry_date: '2026-06-01', entry_type: 'termes', body: 'Első szedés, bőséges', bed_id: bed.id } });
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { lastFrost: '05-01' } });
});

describe('JSON export és visszatöltés', () => {
  it('az export minden táblát tartalmaz, letölthető fájlként', async () => {
    const res = await app.inject({ url: '/api/export' });
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="kerttervezo-\d{4}-\d{2}-\d{2}\.json"$/);
    exported = res.json();
    expect(exported).toMatchObject({ format: 'kerttervezo-export', schema: '003_carry_over.sql' });
    expect(exported.tables.bed).toHaveLength(1);
    expect(exported.tables.plant!.length).toBeGreaterThan(50);
    expect(exported.tables.journal_entry![0]).toMatchObject({ body: 'Első szedés, bőséges' });
  });

  it('visszatöltés: teljes csere, előtte mentés; a napló keresője is működik', async () => {
    await app.inject({ method: 'POST', url: '/api/beds', payload: { name: 'Új ágyás', length_cm: 100, width_cm: 100 } });
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { lastFrost: '05-20' } });
    expect(count('bed')).toBe(2);

    const res = await app.inject({ method: 'POST', url: '/api/import', payload: exported });
    expect(res.statusCode).toBe(200);
    expect(res.json().counts).toMatchObject({ bed: 1, planting: 1, journal_entry: 1 });
    expect(res.json().backup).toMatch(/^garden-\d{8}-\d{6}\.db$/);
    expect(readdirSync(dir)).toContain(res.json().backup);

    expect((await app.inject({ url: '/api/beds' })).json().map((b: Bed) => b.name)).toEqual(['Régi ágyás']);
    expect((await app.inject({ url: '/api/settings' })).json().lastFrost).toBe('05-01');
    const found = (await app.inject({ url: '/api/journal?q=szedes' })).json();
    expect(found).toHaveLength(1);
  });

  it('hibás fájlnál semmi sem változik', async () => {
    const before = count('plant');
    const notOurs = await app.inject({ method: 'POST', url: '/api/import', payload: { hello: 'world' } });
    expect(notOurs.statusCode).toBe(400);
    expect(notOurs.json().error).toBe('Ez nem a Kerttervező mentésfájlja.');

    const newer = await app.inject({ method: 'POST', url: '/api/import', payload: { ...exported, schema: '999_jovo.sql' } });
    expect(newer.statusCode).toBe(400);

    // Hibás hivatkozás: az ültetés nem létező növényre mutat
    const broken = structuredClone(exported);
    broken.tables.planting![0]!.plant_id = 999_999;
    const res = await app.inject({ method: 'POST', url: '/api/import', payload: broken });
    expect(res.statusCode).toBe(400);
    expect(count('plant')).toBe(before);
    expect(count('planting')).toBe(1);
  });

  it('kézi mentés és a mentések listája', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/backups' });
    expect(res.statusCode).toBe(201);
    const list = (await app.inject({ url: '/api/backups' })).json();
    expect(list.files[0].name).toBe(res.json().file);
  });
});
