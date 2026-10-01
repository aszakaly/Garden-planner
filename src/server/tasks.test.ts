import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DB } from './db/index.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';
import type { TaskItem } from '../shared/domain/tasks.ts';
import type { Bed, PlantListItem, PlantingListItem } from '../shared/types.ts';

let db: DB;
let app: FastifyInstance;
let plants: PlantListItem[];
let bed: Bed;
let tomato: PlantingListItem;
const plantId = (code: string) => plants.find((p) => p.code === code)!.id;

const list = async (from: string, to: string): Promise<TaskItem[]> =>
  (await app.inject({ url: `/api/tasks?from=${from}&to=${to}` })).json();
const patch = (key: string, payload: object) =>
  app.inject({ method: 'PATCH', url: `/api/tasks/${encodeURIComponent(key)}`, payload });
const planting = async (id: number): Promise<PlantingListItem> => (await app.inject({ url: `/api/plantings/${id}` })).json();
const byKey = (tasks: TaskItem[]) => new Map(tasks.map((t) => [t.key, t]));

beforeAll(async () => {
  db = openDatabase(':memory:');
  seedIfEmpty(db);
  app = buildApp({ db });
  plants = (await app.inject({ url: '/api/plants' })).json();
  bed = (
    await app.inject({ method: 'POST', url: '/api/beds', payload: { name: 'Emelt 1', length_cm: 400, width_cm: 120, bed_type: 'emelt' } })
  ).json();
  [tomato] = (
    await app.inject({
      method: 'POST',
      url: '/api/plantings',
      payload: {
        year: 2027, plant_id: plantId('paradicsom'), bed_id: bed.id, method: 'palanta', plant_count: 8,
        axis_start_cm: 0, axis_span_cm: 80,
        plan_sow_date: '2027-03-15', plan_transplant_date: '2027-05-10', plan_harvest_start: '2027-07-14', plan_end_date: '2027-10-12',
      },
    })
  ).json();
});

describe('feladatok', () => {
  it('a tervből generálja az év feladatait, beszerzéssel együtt', async () => {
    const tasks = await list('2027-01-01', '2027-12-31');
    expect(tasks.map((t) => t.key)).toEqual([
      `beszerzes:2027:p${plantId('paradicsom')}`,
      `vetes:${tomato.id}`,
      `szoktatas:${tomato.id}`,
      `kiultetes:${tomato.id}`,
      `betakaritas:${tomato.id}`,
      `felszabadul:${tomato.id}`,
    ]);
    expect(tasks[0]).toMatchObject({ date: '2027-02-22', title: 'Vetőmag beszerzése: paradicsom', bed_name: 'Emelt 1' });
  });

  it('egy hónap lekérésekor csak az abba eső feladatok jönnek', async () => {
    const may = await list('2027-05-01', '2027-05-31');
    expect(may.map((t) => [t.slot, t.date])).toEqual([
      ['szoktatas', '2027-05-03'],
      ['kiultetes', '2027-05-10'],
    ]);
  });

  it('pipálás: a tény dátum az ültetésbe kerül, a státusz frissül, a későbbi lépések csúsznak', async () => {
    expect((await patch(`vetes:${tomato.id}`, { done_on: '2027-03-20' })).statusCode).toBe(204);
    expect(await planting(tomato.id)).toMatchObject({ actual_sow_date: '2027-03-20', status: 'folyamatban', plan_sow_date: '2027-03-15' });
    const tasks = byKey(await list('2027-01-01', '2027-12-31'));
    expect(tasks.get(`vetes:${tomato.id}`)).toMatchObject({ done_on: '2027-03-20', date: '2027-03-20' });
    expect(tasks.get(`kiultetes:${tomato.id}`)).toMatchObject({ done_on: null, date: '2027-05-15' });
    // Elkezdett ültetéshez már nem kell vetőmagot venni
    expect([...tasks.keys()].some((k) => k.startsWith('beszerzes'))).toBe(false);

    await patch(`vetes:${tomato.id}`, { done_on: null });
    expect(await planting(tomato.id)).toMatchObject({ actual_sow_date: null, status: 'terv' });
  });

  it('a terület felszabadulásának pipálása lezárja az ültetést', async () => {
    await patch(`felszabadul:${tomato.id}`, { done_on: '2027-10-01' });
    expect((await planting(tomato.id)).status).toBe('lezart');
    await patch(`felszabadul:${tomato.id}`, { done_on: null });
    expect((await planting(tomato.id)).status).toBe('terv');
  });

  it('nem dátumhoz kötött feladat (szoktatás) állapota, áthelyezés és megjegyzés', async () => {
    await patch(`szoktatas:${tomato.id}`, { done_on: '2027-05-04' });
    await patch(`kiultetes:${tomato.id}`, { moved_to: '2027-05-17', note: 'hideg az idő' });
    const tasks = byKey(await list('2027-05-01', '2027-05-31'));
    expect(tasks.get(`szoktatas:${tomato.id}`)).toMatchObject({ done_on: '2027-05-04' });
    expect(tasks.get(`kiultetes:${tomato.id}`)).toMatchObject({ date: '2027-05-17', moved_to: '2027-05-17', planned: '2027-05-10', note: 'hideg az idő' });
    expect((await planting(tomato.id)).plan_transplant_date).toBe('2027-05-10');

    await patch(`kiultetes:${tomato.id}`, { moved_to: null, note: null });
    expect(db.prepare('SELECT * FROM task_state WHERE task_key = ?').get(`kiultetes:${tomato.id}`)).toBeUndefined();
  });

  it('hibás kulcs 400, nem létező ültetés 404, hibás időszak 400', async () => {
    expect((await patch('valami:1', { done_on: '2027-05-01' })).statusCode).toBe(400);
    expect((await patch('vetes:99999', { done_on: '2027-05-01' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/tasks?from=2027-05-01&to=2027-04-01' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/tasks?from=2027-05-01' })).statusCode).toBe(400);
  });

  it('saját feladat: létrehozás, pipálás, módosítás, törlés', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/custom-tasks', payload: { title: ' ', due_date: '2027-04-02' } })).statusCode).toBe(400);
    const res = await app.inject({
      method: 'POST',
      url: '/api/custom-tasks',
      payload: { title: 'Komposzt átforgatása', due_date: '2027-04-02', bed_id: bed.id, notes: 'a hátsó keretben' },
    });
    expect(res.statusCode).toBe(201);
    const task: TaskItem = res.json();
    expect(task).toMatchObject({ key: `sajat:${task.custom_id}`, category: 'sajat', bed_name: 'Emelt 1', detail: 'a hátsó keretben' });

    await patch(task.key, { done_on: '2027-04-03' });
    let april = byKey(await list('2027-04-01', '2027-04-30'));
    expect(april.get(task.key)).toMatchObject({ done_on: '2027-04-03', date: '2027-04-02' });

    const updated = await app.inject({ method: 'PUT', url: `/api/custom-tasks/${task.custom_id}`, payload: { title: 'Komposzt', due_date: '2027-04-05' } });
    expect(updated.json()).toMatchObject({ title: 'Komposzt', date: '2027-04-05', bed_id: null, done_on: null });

    expect((await app.inject({ method: 'DELETE', url: `/api/custom-tasks/${task.custom_id}` })).statusCode).toBe(204);
    april = byKey(await list('2027-04-01', '2027-04-30'));
    expect(april.has(task.key)).toBe(false);
  });

  it('az ültetés törlésekor a feladatállapot is törlődik', async () => {
    await patch(`kiultetes:${tomato.id}`, { note: 'megjegyzés' });
    await app.inject({ method: 'DELETE', url: `/api/plantings/${tomato.id}` });
    expect(db.prepare("SELECT COUNT(*) AS n FROM task_state WHERE task_key LIKE '%:' || ?").get(tomato.id)).toEqual({ n: 0 });
  });
});
