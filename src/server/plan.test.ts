import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DB } from './db/index.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';
import type { Bed, BedListItem, PlantDetail, PlantListItem, PlantingListItem, SeedStockListItem } from '../shared/types.ts';

let db: DB;
let app: FastifyInstance;
let plants: PlantListItem[];
let bed: Bed;
const plantId = (code: string) => plants.find((p) => p.code === code)!.id;

beforeAll(async () => {
  db = openDatabase(':memory:');
  seedIfEmpty(db);
  app = buildApp({ db });
  plants = (await app.inject({ url: '/api/plants' })).json();
  bed = (
    await app.inject({
      method: 'POST',
      url: '/api/beds',
      payload: { name: 'Emelt 1', length_cm: 400, width_cm: 120, bed_type: 'emelt' },
    })
  ).json();
});

const post = (payload: object) => app.inject({ method: 'POST', url: '/api/plantings', payload });

describe('ültetések', () => {
  it('év nélkül elutasítja (400)', async () => {
    const res = await post({ plant_id: plantId('retek') });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toContainEqual({ path: 'year', message: 'Az év megadása kötelező' });
  });

  it('gyors előzmény: csak évvel és növénnyel is felvehető', async () => {
    const res = await post({ year: 2025, plant_id: plantId('paradicsom'), bed_id: bed.id, is_history: true });
    expect(res.statusCode).toBe(201);
    const [p]: PlantingListItem[] = res.json();
    expect(p).toMatchObject({ year: 2025, is_history: true, status: 'terv', plan_sow_date: null, bed_name: 'Emelt 1' });
  });

  it('a vetőmagtételből kiderül a fajta; más növény fajtája hibát ad', async () => {
    const seed: SeedStockListItem = (
      await app.inject({ method: 'POST', url: '/api/seeds', payload: { plant_id: plantId('paradicsom'), variety_name: 'Ökörszív', vintage_year: 2026 } })
    ).json();
    const [p]: PlantingListItem[] = (
      await post({
        year: 2027, plant_id: plantId('paradicsom'), seed_stock_id: seed.id, bed_id: bed.id, method: 'palanta',
        axis_start_cm: 0, axis_span_cm: 80, rows: 1,
        plan_sow_date: '2027-03-15', plan_transplant_date: '2027-05-10', plan_harvest_start: '2027-07-14', plan_end_date: '2027-10-12',
      })
    ).json();
    expect(p).toMatchObject({ variety_id: seed.variety_id, variety_name: 'Ökörszív', has_seed: true, seed_vintage: 2026, crop_group_code: 'termes' });
    expect(p!.row_spacing_cm).toBe(80);

    const wrong = await post({ year: 2027, plant_id: plantId('paprika'), variety_id: seed.variety_id });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toBe('A fajta nem ehhez a növényhez tartozik.');
  });

  it('más növény termesztési időszaka nem választható', async () => {
    const detail: PlantDetail = (await app.inject({ url: `/api/plants/${plantId('retek')}` })).json();
    const res = await post({ year: 2027, plant_id: plantId('salata'), window_id: detail.windows[0]!.id });
    expect(res.statusCode).toBe(400);
  });

  it('újravetés-sorozat: eltolt dátumok, szabad sávok, közös sorozat', async () => {
    const res = await post({
      year: 2027, plant_id: plantId('retek'), bed_id: bed.id, method: 'helyrevetes', rows: 3,
      axis_start_cm: 100, axis_span_cm: 45,
      plan_sow_date: '2027-03-01', plan_harvest_start: '2027-04-01', plan_end_date: '2027-04-13',
      series: { count: 4, interval_days: 14 },
    });
    expect(res.statusCode).toBe(201);
    const items: PlantingListItem[] = res.json();
    expect(items.map((p) => p.plan_sow_date)).toEqual(['2027-03-01', '2027-03-15', '2027-03-29', '2027-04-12']);
    // A 2. vetés a még üres ágyáselejére kerül; a 3. már egy napot átfedne a május 10-től
    // 0–80 cm-en álló paradicsommal, ezért az 1. vetés utáni sávba megy; a 4. idején az 1. még foglal
    expect(items.map((p) => p.axis_start_cm)).toEqual([100, 0, 145, 190]);
    expect(new Set(items.map((p) => p.series_id)).size).toBe(1);
    expect(items.map((p) => [p.series_index, p.series_size])).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
  });

  it('az év listájában az előző évről áthúzódó ültetés is megjelenik', async () => {
    await post({
      year: 2026, plant_id: plantId('fokhagyma'), bed_id: bed.id, method: 'ultetes', axis_start_cm: 300, axis_span_cm: 75,
      plan_sow_date: '2026-10-01', plan_harvest_start: '2027-06-20', plan_end_date: '2027-07-20',
    });
    const list2027: PlantingListItem[] = (await app.inject({ url: '/api/plantings?year=2027' })).json();
    expect(list2027.map((p) => p.plant_name)).toContain('Fokhagyma');
    const list2028: PlantingListItem[] = (await app.inject({ url: '/api/plantings?year=2028' })).json();
    expect(list2028).toEqual([]);
    const beds: BedListItem[] = (await app.inject({ url: '/api/beds?year=2027' })).json();
    // az ágyás ültetésszáma csak az adott év saját ültetéseit számolja
    expect(beds.find((b) => b.id === bed.id)!.planting_count).toBe(5);
  });

  it('módosítás megtartja a tény adatokat, a sorozat együtt törölhető', async () => {
    const list: PlantingListItem[] = (await app.inject({ url: `/api/plantings?year=2027&bed_id=${bed.id}` })).json();
    const radish = list.filter((p) => p.plant_name === 'Retek');
    const target = radish[1]!;
    db.prepare("UPDATE planting SET actual_sow_date = '2027-03-16', status = 'folyamatban' WHERE id = ?").run(target.id);

    const put = await app.inject({
      method: 'PUT',
      url: `/api/plantings/${target.id}`,
      payload: { year: 2027, plant_id: target.plant_id, bed_id: bed.id, method: 'helyrevetes', plan_sow_date: '2027-03-18', notes: 'Jégcsap' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ plan_sow_date: '2027-03-18', actual_sow_date: '2027-03-16', status: 'folyamatban', axis_start_cm: null, notes: 'Jégcsap' });

    const del = await app.inject({ method: 'DELETE', url: `/api/plantings/${target.id}?series=1` });
    expect(del.statusCode).toBe(204);
    const after: PlantingListItem[] = (await app.inject({ url: `/api/plantings?year=2027&bed_id=${bed.id}` })).json();
    expect(after.filter((p) => p.plant_name === 'Retek')).toEqual([]);
  });
});
