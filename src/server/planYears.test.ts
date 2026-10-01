import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DB } from './db/index.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';
import type { Bed, PlantListItem, PlantingListItem } from '../shared/types.ts';
import type { TaskItem } from '../shared/domain/tasks.ts';

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
  bed = (await app.inject({ method: 'POST', url: '/api/beds', payload: { name: 'Évelők', length_cm: 300, width_cm: 100 } })).json();
});

const plant = async (payload: object): Promise<PlantingListItem> =>
  (await app.inject({ method: 'POST', url: '/api/plantings', payload })).json()[0];

describe('tervév', () => {
  it('rögzítés nélkül az évből adódó állapot; mentés után a megadott', async () => {
    const before = (await app.inject({ url: '/api/plan-years/2099' })).json();
    expect(before).toMatchObject({ year: 2099, status: 'tervezes', notes: null, stored: false });
    const saved = await app.inject({ method: 'PUT', url: '/api/plan-years/2099', payload: { status: 'aktiv', notes: 'Több bab' } });
    expect(saved.json()).toMatchObject({ status: 'aktiv', notes: 'Több bab', stored: true });
    const bad = await app.inject({ method: 'PUT', url: '/api/plan-years/2099', payload: { status: 'kesz' } });
    expect(bad.statusCode).toBe(400);
  });

  it('évelők átvitele: csak az álló évelők, egyszer; a hely január 1-jétől foglalt', async () => {
    const eper = await plant({
      year: 2026, plant_id: plantId('eper'), bed_id: bed.id, method: 'ultetes', axis_start_cm: 0, axis_span_cm: 60,
      plan_sow_date: '2026-08-20', plan_harvest_start: '2027-05-15',
    });
    await plant({ year: 2026, plant_id: plantId('retek'), bed_id: bed.id, method: 'helyrevetes', plan_sow_date: '2026-04-01' });
    const removed = await plant({ year: 2026, plant_id: plantId('rozmaring'), bed_id: bed.id, method: 'ultetes', plan_sow_date: '2026-05-01', plan_end_date: '2026-10-01' });

    const candidates: PlantingListItem[] = (await app.inject({ url: '/api/plan-years/2027/carryover' })).json();
    expect(candidates.map((p) => p.id)).toEqual([eper.id]);

    const res = await app.inject({ method: 'POST', url: '/api/plan-years/2027/carryover', payload: { ids: [eper.id] } });
    expect(res.statusCode).toBe(201);
    const carried: PlantingListItem = res.json()[0];
    expect(carried).toMatchObject({ year: 2027, carried_from_id: eper.id, bed_id: bed.id, axis_span_cm: 60, plan_sow_date: null, plan_harvest_start: '2027-05-15' });
    // A tavalyi rekord jövő évi betakarítását az áthozott vette át
    expect((await app.inject({ url: `/api/plantings/${eper.id}` })).json().plan_harvest_start).toBeNull();
    expect((await app.inject({ url: '/api/plan-years/2027' })).json().stored).toBe(true);

    // Másodszor már nem vihető át, és a felszámolt évelő sem
    expect((await app.inject({ url: '/api/plan-years/2027/carryover' })).json()).toEqual([]);
    const again = await app.inject({ method: 'POST', url: '/api/plan-years/2027/carryover', payload: { ids: [eper.id, removed.id] } });
    expect(again.statusCode).toBe(400);

    // Feladat: csak a betakarítás (nincs vetés, kiültetés, felszabadulás)
    const tasks: TaskItem[] = (await app.inject({ url: '/api/tasks?from=2027-01-01&to=2027-12-31' })).json();
    expect(tasks.filter((t) => t.planting_id === carried.id).map((t) => t.slot)).toEqual(['betakaritas']);
    expect(tasks.filter((t) => t.planting_id === eper.id)).toEqual([]);
  });
});
