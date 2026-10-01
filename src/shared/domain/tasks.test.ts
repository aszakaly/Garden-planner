import { describe, expect, it } from 'vitest';
import type { Bed, PlantingListItem } from '../types.ts';
import { blankPlanting } from './plantings.ts';
import {
  expectedDates,
  generateTasks,
  parseTaskKey,
  purchaseKey,
  statusFromActuals,
  type TaskItem,
  type TaskState,
} from './tasks.ts';

const bed: Bed = {
  id: 1, garden_id: 1, name: 'Emelt 1', color: 'green', length_cm: 400, width_cm: 120, row_direction: 'keresztben',
  pos_x_cm: null, pos_y_cm: null, rotation_deg: 0, bed_type: 'emelt', sun: null, soil: null, irrigation: null, notes: null,
  active_from_year: null, active_to_year: null, sort_order: 0,
};

const planting = (over: Partial<PlantingListItem>): PlantingListItem => ({
  ...blankPlanting(),
  year: 2027,
  plant_id: 1,
  plant_name: 'Paradicsom',
  bed_id: 1,
  bed_name: 'Emelt 1',
  bed_color: 'green',
  has_seed: true,
  ...over,
});

const tomato = planting({
  id: 10,
  method: 'palanta',
  variety_id: 5,
  variety_name: 'Ökörszív',
  plant_count: 8,
  axis_start_cm: 0,
  axis_span_cm: 80,
  plan_sow_date: '2027-03-15',
  plan_transplant_date: '2027-05-10',
  plan_harvest_start: '2027-07-14',
  plan_end_date: '2027-10-12',
});

function tasks(plantings: PlantingListItem[], states: TaskState[] = []) {
  return generateTasks({
    plantings,
    states: new Map(states.map((s) => [s.task_key, s])),
    beds: new Map([[1, bed]]),
  });
}
const byKey = (list: TaskItem[]) => new Map(list.map((t) => [t.key, t]));
const state = (task_key: string, s: Partial<TaskState>): TaskState => ({ task_key, done_at: null, moved_to: null, note: null, ...s });

describe('feladatok generálása', () => {
  it('saját palánta: vetés tálcába, szoktatás, kiültetés, betakarítás, felszabadulás', () => {
    const list = tasks([tomato]);
    expect(list.map((t) => [t.key, t.date, t.title])).toEqual([
      ['vetes:10', '2027-03-15', 'Paradicsom vetése palántának'],
      ['szoktatas:10', '2027-05-03', 'Paradicsom palántáinak szoktatása'],
      ['kiultetes:10', '2027-05-10', 'Paradicsom kiültetése'],
      ['betakaritas:10', '2027-07-14', 'Paradicsom betakarításának kezdete'],
      ['felszabadul:10', '2027-10-12', 'Paradicsom helye felszabadul'],
    ]);
    expect(list[0]).toMatchObject({ label: 'Palántanevelés', category: 'vetes', bed_name: 'Emelt 1', done_on: null });
    expect(list[0]!.detail).toBe('Ökörszív · 8 tő · kiültetés: máj. 10.');
  });

  it('a kulcsok a terv módosítása után is ugyanazok', () => {
    const before = tasks([tomato]).map((t) => t.key);
    const after = tasks([{ ...tomato, method: 'helyrevetes', plan_transplant_date: null, plan_sow_date: '2027-05-01' }]).map((t) => t.key);
    expect(after).toEqual(['vetes:10', 'betakaritas:10', 'felszabadul:10']);
    expect(after.every((k) => before.includes(k))).toBe(true);
  });

  it('vásárolt palánta: beszerzés a kiültetés előtt, vetés nincs', () => {
    const list = tasks([{ ...tomato, method: 'vasarolt_palanta', plan_sow_date: null, has_seed: false }]);
    expect(list.map((t) => t.key)).toEqual(['palanta_beszerzes:10', 'kiultetes:10', 'betakaritas:10', 'felszabadul:10']);
    expect(list[0]).toMatchObject({ date: '2027-05-07', title: 'Palánta beszerzése: paradicsom (Ökörszív)', category: 'beszerzes' });
  });

  it('újravetés-sorozat: a második tagtól „újravetés”, a sorszám a részletekben', () => {
    const radish = (id: number, i: number, sow: string) =>
      planting({ id, plant_name: 'Retek', method: 'helyrevetes', series_id: 's', series_index: i, series_size: 2, rows: 1, plan_sow_date: sow });
    const list = tasks([radish(1, 1, '2027-04-01'), radish(2, 2, '2027-04-15')]);
    expect(list.map((t) => [t.title, t.label, t.detail])).toEqual([
      ['Retek vetése', 'Helyrevetés', '1 sor · sorozat: 1/2'],
      ['Retek újravetése', 'Újravetés', '1 sor · sorozat: 2/2'],
    ]);
  });

  it('vetőmag-beszerzés fajtánként egyszer, 3 héttel az első vetés előtt', () => {
    const carrot = (id: number, sow: string) =>
      planting({ id, plant_id: 2, plant_name: 'Sárgarépa', variety_id: 7, variety_name: 'Nantesi', method: 'helyrevetes', has_seed: false, plan_sow_date: sow });
    const list = tasks([carrot(1, '2027-04-10'), carrot(2, '2027-03-20'), { ...carrot(3, '2027-05-01'), has_seed: true }]);
    const purchase = list.filter((t) => t.slot === 'beszerzes');
    expect(purchase).toHaveLength(1);
    expect(purchase[0]).toMatchObject({
      key: purchaseKey(2027, 7, 2),
      date: '2027-02-27',
      title: 'Vetőmag beszerzése: sárgarépa (Nantesi)',
      planting_ids: [1, 2],
      detail: '2 ültetéshez · első vetés: márc. 20. · nincs készleten',
    });
  });

  it('ültetésnél (fokhagyma) szaporítóanyag kell; vásárolt palántánál nem kell vetőmag', () => {
    const garlic = planting({ id: 3, plant_id: 3, plant_name: 'Fokhagyma', method: 'ultetes', has_seed: false, plan_sow_date: '2026-10-10' });
    const list = tasks([garlic, { ...tomato, method: 'vasarolt_palanta', has_seed: false }]);
    expect(list.filter((t) => t.slot === 'beszerzes').map((t) => t.title)).toEqual(['Szaporítóanyag beszerzése: fokhagyma']);
    expect(list.find((t) => t.key === 'vetes:3')!.title).toBe('Fokhagyma ültetése');
  });

  it('a tény dátum elvégzetté teszi, és a későbbi lépések vele csúsznak', () => {
    const list = byKey(tasks([{ ...tomato, actual_sow_date: '2027-03-25', status: 'folyamatban' }]));
    expect(list.get('vetes:10')).toMatchObject({ done_on: '2027-03-25', date: '2027-03-25', planned: '2027-03-15' });
    expect(list.get('kiultetes:10')).toMatchObject({ done_on: null, date: '2027-05-20', planned: '2027-05-10' });
    expect(list.get('szoktatas:10')!.date).toBe('2027-05-13');
    expect(list.get('felszabadul:10')!.date).toBe('2027-10-22');
  });

  it('áthelyezés: a dátumhoz kötött lépés és az utána következők is csúsznak; a terv marad', () => {
    const list = byKey(tasks([tomato], [state('kiultetes:10', { moved_to: '2027-05-17', note: 'hideg az idő' })]));
    expect(list.get('kiultetes:10')).toMatchObject({ date: '2027-05-17', moved_to: '2027-05-17', planned: '2027-05-10', note: 'hideg az idő' });
    expect(list.get('szoktatas:10')!.date).toBe('2027-05-10');
    expect(list.get('betakaritas:10')!.date).toBe('2027-07-21');
    expect(list.get('vetes:10')!.date).toBe('2027-03-15');
  });

  it('a nem dátumhoz kötött feladat (szoktatás, beszerzés) állapota a task_state-ben van', () => {
    const list = byKey(tasks([tomato], [state('szoktatas:10', { done_at: '2027-05-04' })]));
    expect(list.get('szoktatas:10')).toMatchObject({ done_on: '2027-05-04', date: '2027-05-03' });
  });

  it('ha egy későbbi lépés megtörtént, a korábbi el nem végzettek eltűnnek', () => {
    const list = tasks([{ ...tomato, actual_transplant_date: '2027-05-12', status: 'folyamatban' }]);
    expect(list.map((t) => t.key)).toEqual(['kiultetes:10', 'betakaritas:10', 'felszabadul:10']);
  });

  it('lezárt ültetésnél csak az elvégzett lépések maradnak; elmaradt és előzmény nem ad feladatot', () => {
    expect(tasks([{ ...tomato, status: 'lezart', actual_sow_date: '2027-03-15' }]).map((t) => t.key)).toEqual(['vetes:10']);
    expect(tasks([{ ...tomato, status: 'elmaradt' }])).toEqual([]);
    expect(tasks([{ ...tomato, is_history: true, status: 'lezart' }])).toEqual([]);
  });

  it('felszabaduláskor jelzi, mi következik ugyanarra a helyre', () => {
    const garlic = planting({
      id: 11, plant_id: 3, plant_name: 'Fokhagyma', method: 'ultetes', plan_sow_date: '2027-10-15', axis_start_cm: 40, axis_span_cm: 60,
    });
    const elsewhere = planting({ id: 12, plant_name: 'Spenót', method: 'helyrevetes', plan_sow_date: '2027-10-13', axis_start_cm: 200, axis_span_cm: 40 });
    const list = byKey(tasks([tomato, garlic, elsewhere]));
    expect(list.get('felszabadul:10')!.detail).toBe('Ökörszív · 8 tő · utána: fokhagyma');
  });

  it('évelőnél nincs felszabadulás', () => {
    expect(tasks([{ ...tomato, perennial: true, plan_end_date: null }]).some((t) => t.slot === 'felszabadul')).toBe(false);
  });
});

describe('várható dátumok és státusz', () => {
  it('a tény és az áthelyezés eltolja a későbbi tervezett dátumokat', () => {
    expect(expectedDates({ ...tomato, actual_sow_date: '2027-03-10' })).toEqual({
      sow: '2027-03-10', transplant: '2027-05-05', harvestStart: '2027-07-09', end: '2027-10-07',
    });
    expect(expectedDates(tomato, { harvestStart: '2027-07-24' })).toMatchObject({ transplant: '2027-05-10', end: '2027-10-22' });
  });

  it('státusz a tény dátumokból', () => {
    const none = { sow: null, transplant: null, harvestStart: null, end: null };
    expect(statusFromActuals('terv', { ...none, sow: '2027-03-15' })).toBe('folyamatban');
    expect(statusFromActuals('folyamatban', { ...none, sow: '2027-03-15', end: '2027-10-01' })).toBe('lezart');
    expect(statusFromActuals('lezart', none)).toBe('terv');
    expect(statusFromActuals('elmaradt', { ...none, sow: '2027-03-15' })).toBe('elmaradt');
  });
});

describe('feladatkulcsok', () => {
  it('visszafejthetők', () => {
    expect(parseTaskKey('vetes:12')).toEqual({ slot: 'vetes', plantingId: 12 });
    expect(parseTaskKey('beszerzes:2027:v7')).toEqual({ slot: 'beszerzes', year: 2027, varietyId: 7, plantId: null });
    expect(parseTaskKey('beszerzes:2027:p3')).toEqual({ slot: 'beszerzes', year: 2027, varietyId: null, plantId: 3 });
    expect(parseTaskKey('sajat:4')).toEqual({ slot: 'sajat', customId: 4 });
    expect(parseTaskKey('ismeretlen:4')).toBeNull();
    expect(parseTaskKey('beszerzes:5')).toBeNull();
  });
});
