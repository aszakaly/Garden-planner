import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DB } from './db/index.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';
import type { Bed, BedListItem, PlantDetail, PlantListItem, SeedStockListItem } from '../shared/types.ts';

let db: DB;
let app: FastifyInstance;
let plantId: (code: string) => number;

beforeAll(async () => {
  db = openDatabase(':memory:');
  seedIfEmpty(db);
  app = buildApp({ db });
  const plants: PlantListItem[] = (await app.inject({ url: '/api/plants' })).json();
  plantId = (code) => plants.find((p) => p.code === code)!.id;
});

describe('vetőmagkészlet', () => {
  it('új fajtanévvel létrehozza a fajtát, azonos névvel újrahasznosítja', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/seeds',
      payload: { plant_id: plantId('paradicsom'), variety_name: 'Ökörszív', vintage_year: 2021, supplier: 'Kertimag' },
    });
    expect(first.statusCode).toBe(201);
    const seed: SeedStockListItem = first.json();
    expect(seed).toMatchObject({ variety_name: 'Ökörszív', plant_name: 'Paradicsom', in_stock: true });

    const second: SeedStockListItem = (
      await app.inject({
        method: 'POST',
        url: '/api/seeds',
        payload: { plant_id: plantId('paradicsom'), variety_name: 'ökörszív', vintage_year: 2025, origin_type: 'sajat' },
      })
    ).json();
    expect(second.variety_id).toBe(seed.variety_id);
  });

  it('csírázóképességet számol (paradicsom 4 év)', async () => {
    const list: SeedStockListItem[] = (await app.inject({ url: '/api/seeds' })).json();
    const year = new Date().getFullYear();
    const old = list.find((s) => s.vintage_year === 2021)!;
    expect(old.viability).toBe(year > 2025 ? 'lejart' : year === 2025 ? 'utolso' : 'ok');
  });

  it('fajta vagy új név nélkül hibát ad', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/seeds', payload: { plant_id: plantId('paprika') } });
    expect(res.statusCode).toBe(400);
  });

  it('elfogyottnak jelölés és a növény adatlapján a készlet-összesítő', async () => {
    const list: SeedStockListItem[] = (await app.inject({ url: '/api/seeds' })).json();
    const old = list.find((s) => s.vintage_year === 2021)!;
    const patched = await app.inject({ method: 'PATCH', url: `/api/seeds/${old.id}`, payload: { in_stock: false } });
    expect(patched.json().in_stock).toBe(false);

    const detail: PlantDetail = (await app.inject({ url: `/api/plants/${plantId('paradicsom')}` })).json();
    const variety = detail.varieties.find((v) => v.name === 'Ökörszív')!;
    expect(variety.stock_count).toBe(1);
    expect(variety.latest_vintage).toBe(2025);
  });
});

describe('ágyások', () => {
  it('létrehozás az alapértelmezett kertbe, érvénytelen méret elutasítva', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/beds',
      payload: { name: 'Emelt ágyás 1', color: 'orange', length_cm: 400, width_cm: 120, bed_type: 'emelt' },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ garden_id: 1, row_direction: 'keresztben' });

    const raised = await app.inject({
      method: 'POST',
      url: '/api/beds',
      payload: { name: 'Magaságyás 1', length_cm: 200, width_cm: 80, bed_type: 'magasagyas' },
    });
    expect(raised.statusCode).toBe(201);
    expect(raised.json().bed_type).toBe('magasagyas');

    const bad = await app.inject({ method: 'POST', url: '/api/beds', payload: { name: 'X', length_cm: 5, width_cm: 100 } });
    expect(bad.statusCode).toBe(400);

    const reversed = await app.inject({
      method: 'POST',
      url: '/api/beds',
      payload: { name: 'Y', length_cm: 100, width_cm: 100, active_from_year: 2026, active_to_year: 2024 },
    });
    expect(reversed.statusCode).toBe(400);
  });

  it('év szerinti aktív szűrés', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/beds',
      payload: { name: 'Régi ágyás', length_cm: 300, width_cm: 100, active_to_year: 2023 },
    });
    const all: BedListItem[] = (await app.inject({ url: '/api/beds?year=2026' })).json();
    const active: BedListItem[] = (await app.inject({ url: '/api/beds?year=2026&active=1' })).json();
    expect(all.map((b) => b.name)).toContain('Régi ágyás');
    expect(active.map((b) => b.name)).not.toContain('Régi ágyás');
    const past: BedListItem[] = (await app.inject({ url: '/api/beds?year=2022&active=1' })).json();
    expect(past.map((b) => b.name)).toContain('Régi ágyás');
  });

  it('ültetéssel rendelkező ágyás nem törölhető', async () => {
    const beds: BedListItem[] = (await app.inject({ url: '/api/beds' })).json();
    const bed = beds.find((b) => b.name === 'Emelt ágyás 1')!;
    db.prepare('INSERT INTO planting (year, plant_id, bed_id) VALUES (2026, ?, ?)').run(plantId('retek'), bed.id);
    expect((await app.inject({ method: 'DELETE', url: `/api/beds/${bed.id}` })).statusCode).toBe(409);
    const counted: BedListItem[] = (await app.inject({ url: '/api/beds?year=2026' })).json();
    expect(counted.find((b) => b.id === bed.id)!.planting_count).toBe(1);
  });

  it('több egyforma ágyás egyszerre, sorszámozott névvel a lista végére', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/beds/batch',
      payload: { bed: { name: 'Emelt ágyás 1', length_cm: 400, width_cm: 120, bed_type: 'emelt', sort_order: 10 }, count: 3 },
    });
    expect(res.statusCode).toBe(201);
    const created: BedListItem[] = res.json();
    expect(created.map((b) => b.name)).toEqual(['Emelt ágyás 2', 'Emelt ágyás 3', 'Emelt ágyás 4']);
    expect(created.every((b) => b.length_cm === 400 && b.width_cm === 120 && b.bed_type === 'emelt')).toBe(true);

    const names = ((await app.inject({ url: '/api/beds' })).json() as BedListItem[]).map((b) => b.name);
    expect(names.slice(-3)).toEqual(['Emelt ágyás 2', 'Emelt ágyás 3', 'Emelt ágyás 4']);

    const single = await app.inject({
      method: 'POST',
      url: '/api/beds/batch',
      payload: { bed: { name: 'X', length_cm: 100, width_cm: 100 }, count: 1 },
    });
    expect(single.statusCode).toBe(400);
  });

  it('a tömegesen létrehozott ágyások nem kapják meg a helyet: két ágyás nem állhat ugyanott', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/beds/batch',
      payload: { bed: { name: 'Fólia A1', length_cm: 600, width_cm: 300, pos_x_cm: 100, pos_y_cm: 200 }, count: 2 },
    });
    expect(res.statusCode).toBe(201);
    const created: Bed[] = res.json();
    expect(created.map((b) => [b.pos_x_cm, b.pos_y_cm])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it('túl hosszú sorszámozott névnél egy ágyás sem jön létre', async () => {
    const before = ((await app.inject({ url: '/api/beds' })).json() as BedListItem[]).length;
    const res = await app.inject({
      method: 'POST',
      url: '/api/beds/batch',
      payload: { bed: { name: 'x'.repeat(100), length_cm: 100, width_cm: 100 }, count: 3 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/legfeljebb 100 karakter/);
    expect(((await app.inject({ url: '/api/beds' })).json() as BedListItem[]).length).toBe(before);
  });
});
