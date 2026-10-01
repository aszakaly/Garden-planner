import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DB } from './db/index.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';
import type { Bed, JournalEntry, PlantListItem, PlantingListItem, SeedStockListItem } from '../shared/types.ts';

let db: DB;
let app: FastifyInstance;
let plants: PlantListItem[];
let bed: Bed;
let tomato: PlantingListItem;
const plantId = (code: string) => plants.find((p) => p.code === code)!.id;

const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });
const search = async (query: string): Promise<JournalEntry[]> => (await app.inject({ url: `/api/journal?${query}` })).json();

beforeAll(async () => {
  db = openDatabase(':memory:');
  seedIfEmpty(db);
  app = buildApp({ db });
  plants = (await app.inject({ url: '/api/plants' })).json();
  bed = (await post('/api/beds', { name: 'Emelt 1', length_cm: 400, width_cm: 120, bed_type: 'emelt' })).json();
  const seed: SeedStockListItem = (await post('/api/seeds', { plant_id: plantId('paradicsom'), variety_name: 'Ökörszív', vintage_year: 2026 })).json();
  [tomato] = (
    await post('/api/plantings', {
      year: 2027, plant_id: plantId('paradicsom'), seed_stock_id: seed.id, bed_id: bed.id, method: 'palanta',
      plan_sow_date: '2027-03-15', plan_transplant_date: '2027-05-10', plan_harvest_start: '2027-07-14', plan_end_date: '2027-10-12',
    })
  ).json();
});

describe('napló', () => {
  let entry: JournalEntry;

  it('ültetéshez kapcsolt bejegyzés: a növény, a fajta és az ágyás az ültetésből jön', async () => {
    const res = await post('/api/journal', {
      entry_date: '2027-07-20',
      entry_type: 'termes',
      planting_id: tomato.id,
      body: 'Első szedés, szép nagy termések',
      amount: 2.5,
      unit: 'kg',
      quality: 5,
      tags: '#Első szedés, első szedés',
    });
    expect(res.statusCode).toBe(201);
    entry = res.json();
    expect(entry).toMatchObject({
      plant_name: 'Paradicsom', variety_name: 'Ökörszív', bed_name: 'Emelt 1', planting_year: 2027, tags: 'első szedés', amount: 2.5,
    });
  });

  it('szöveg vagy mennyiség nélkül, illetve dátum nélkül 400', async () => {
    expect((await post('/api/journal', { entry_date: '2027-07-21', body: '  ' })).statusCode).toBe(400);
    expect((await post('/api/journal', { body: 'valami' })).statusCode).toBe(400);
  });

  it('teljes szöveges keresés ékezet nélkül és szótöredékkel; a nevekben is keres', async () => {
    await post('/api/journal', { entry_date: '2026-08-02', entry_type: 'betegseg', bed_id: bed.id, body: 'Lisztharmat a leveleken az őszi kabakon' });
    expect((await search('q=lisztharm')).map((e) => e.entry_type)).toEqual(['betegseg']);
    expect((await search('q=oszi')).map((e) => e.entry_type)).toEqual(['betegseg']);
    expect((await search('q=okorsz')).map((e) => e.id)).toEqual([entry.id]);
    expect((await search('q=emelt')).length).toBe(2);
    expect(await search('q=%22OR%22%20*')).toEqual([]);
  });

  it('szűrés típusra, évre, ültetésre; darabszám', async () => {
    expect((await search('type=termes')).map((e) => e.id)).toEqual([entry.id]);
    expect((await search('year=2026')).map((e) => e.entry_type)).toEqual(['betegseg']);
    expect((await search(`planting_id=${tomato.id}`)).length).toBe(1);
    expect((await app.inject({ url: '/api/journal/count?year=2027' })).json()).toEqual({ count: 1 });
  });

  it('módosítás (teljes csere) és törlés', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/journal/${entry.id}`,
      payload: { entry_date: '2027-07-21', entry_type: 'megfigyeles', body: 'Csak megfigyelés' },
    });
    expect(res.json()).toMatchObject({ planting_id: null, plant_name: null, amount: null, quality: null, entry_date: '2027-07-21' });
    expect((await search('q=megfigyel')).map((e) => e.id)).toEqual([entry.id]);
    expect((await app.inject({ method: 'DELETE', url: `/api/journal/${entry.id}` })).statusCode).toBe(204);
    expect((await app.inject({ url: `/api/journal/${entry.id}` })).statusCode).toBe(404);
  });
});

describe('tényleges megvalósulás', () => {
  const patch = (payload: object) => app.inject({ method: 'PATCH', url: `/api/plantings/${tomato.id}/actual`, payload });

  it('a tény dátumokból adódik a státusz; a terv nem változik', async () => {
    const res = await patch({ actual_sow_date: '2027-03-18', actual_transplant_date: '2027-05-14' });
    expect(res.json()).toMatchObject({ status: 'folyamatban', actual_sow_date: '2027-03-18', plan_sow_date: '2027-03-15' });
    expect((await patch({ actual_end_date: '2027-10-01' })).json().status).toBe('lezart');
  });

  it('kézi státusz, máshol megvalósult hely, szezonvégi értékelés', async () => {
    const other: Bed = (await post('/api/beds', { name: 'Fólia', length_cm: 300, width_cm: 100, bed_type: 'folia' })).json();
    const res = await patch({
      status: 'sikertelen', actual_bed_id: other.id, actual_axis_start_cm: 0, actual_axis_span_cm: 60,
      eval_success: 2, eval_yield: 'kevés', eval_recommend: 'talan', eval_notes: 'Fitoftóra júliusban',
    });
    expect(res.json()).toMatchObject({ status: 'sikertelen', actual_bed_id: other.id, bed_name: 'Fólia', eval_success: 2, eval_recommend: 'talan' });
    expect((await patch({ eval_success: 9 })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/plantings/99999/actual', payload: {} })).statusCode).toBe(404);
  });

  it('a növény és a fajta minden éves ültetése', async () => {
    await post('/api/plantings', { year: 2025, plant_id: plantId('paradicsom'), is_history: true });
    const byPlant: PlantingListItem[] = (await app.inject({ url: `/api/plantings/history?plant_id=${plantId('paradicsom')}` })).json();
    expect(byPlant.map((p) => p.year)).toEqual([2027, 2025]);
    const byVariety: PlantingListItem[] = (await app.inject({ url: `/api/plantings/history?variety_id=${tomato.variety_id}` })).json();
    expect(byVariety.map((p) => p.id)).toEqual([tomato.id]);
    expect((await app.inject({ url: '/api/plantings/history' })).statusCode).toBe(400);
  });
});
