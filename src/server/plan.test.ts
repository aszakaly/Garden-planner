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
    expect(p).toMatchObject({ year: 2025, is_history: true, status: 'lezart', plan_sow_date: null, bed_name: 'Emelt 1' });
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

describe('tömeges mentés', () => {
  const batch = (payload: object) => app.inject({ method: 'POST', url: '/api/plantings/batch', payload });
  const basil = (o: object = {}) => ({
    year: 2029, plant_id: plantId('bazsalikom'), bed_id: bed.id, method: 'palanta', axis_span_cm: 30,
    plan_transplant_date: '2029-05-15', plan_end_date: '2029-09-20', ...o,
  });
  const listed = async (): Promise<PlantingListItem[]> =>
    (await app.inject({ url: `/api/plantings?year=2029&bed_id=${bed.id}` })).json();

  it('létrehozás, módosítás és törlés egy kérésben', async () => {
    const [keep]: PlantingListItem[] = (await post(basil({ axis_start_cm: 0 }))).json();
    const [drop]: PlantingListItem[] = (await post(basil({ axis_start_cm: 30 }))).json();
    const res = await batch({
      create: [basil({ axis_start_cm: 60, plant_id: plantId('paradicsom') })],
      update: [{ id: keep!.id, data: basil({ axis_start_cm: 10 }) }],
      delete: [drop!.id],
    });
    expect(res.statusCode).toBe(200);
    const { created } = res.json() as { created: number[] };
    expect(created).toHaveLength(1);
    const list = await listed();
    expect(list.find((p) => p.id === keep!.id)?.axis_start_cm).toBe(10);
    // az azonosító újra kiosztódhat, ezért a törölt sáv helye alapján ellenőrzünk
    expect(list.some((p) => p.axis_start_cm === 30)).toBe(false);
    expect(list).toHaveLength(2);
    expect(list.find((p) => p.id === created[0])?.plant_name).toBe('Paradicsom');
  });

  it('egy hibás elemnél semmi sem változik', async () => {
    const before = await listed();
    const missing = await batch({ create: [basil({ axis_start_cm: 0 })], update: [{ id: 999_999, data: basil() }] });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('Az ültetés nem található');
    const badPlant = await batch({ create: [basil(), basil({ plant_id: 999_999 })] });
    expect(badPlant.statusCode).toBe(400);
    expect(badPlant.json().error).toBe('A növény nem található.');
    expect(await listed()).toEqual(before);
  });

  it('üres kérést elutasít', async () => {
    const res = await batch({});
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toContainEqual({ path: '', message: 'Nincs mit menteni.' });
  });

  it('hibás módosítás visszagörgeti a törlést is', async () => {
    const [p]: PlantingListItem[] = (await post(basil({ axis_start_cm: 0 }))).json();
    const res = await batch({ delete: [p!.id], update: [{ id: 999_999, data: basil() }] });
    expect(res.statusCode).toBe(404);
    expect((await listed()).some((x) => x.id === p!.id)).toBe(true);
  });

  it('az újra kiosztott azonosítóhoz nem marad feladatállapot', async () => {
    const [p]: PlantingListItem[] = (await post(basil({ axis_start_cm: 0 }))).json();
    const maxId = (db.prepare('SELECT MAX(id) AS m FROM planting').get() as { m: number }).m;
    // előfeltétel: a törlendő a legnagyobb azonosítójú, így az új ültetés ezt kapja meg újra
    expect(p!.id).toBe(maxId);
    db.prepare('INSERT INTO task_state (task_key, note) VALUES (?, ?)').run(`kiultetes:${maxId}`, 'régi jegyzet');
    const res = await batch({ delete: [maxId], create: [basil({ axis_start_cm: 0 })] });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { created: number[] }).created).toEqual([maxId]);
    expect(db.prepare('SELECT 1 FROM task_state WHERE task_key LIKE ?').get(`%:${maxId}`)).toBeUndefined();
  });

  it('ismétlődő azonosítót elutasít', async () => {
    const [p]: PlantingListItem[] = (await post(basil({ axis_start_cm: 0 }))).json();
    const msg = 'Egy ültetés csak egyszer szerepelhet a mentésben.';
    for (const payload of [
      { delete: [p!.id, p!.id] },
      { update: [{ id: p!.id, data: basil() }, { id: p!.id, data: basil() }] },
      { update: [{ id: p!.id, data: basil() }], delete: [p!.id] },
    ]) {
      const res = await batch(payload);
      expect(res.statusCode).toBe(400);
      expect(res.json().issues).toContainEqual({ path: '', message: msg });
    }
  });

  it('már törölt azonosító törlése nem akadályozza a mentést', async () => {
    const [p]: PlantingListItem[] = (await post(basil({ axis_start_cm: 0 }))).json();
    const res = await batch({ delete: [999_999], update: [{ id: p!.id, data: basil({ axis_start_cm: 20 }) }] });
    expect(res.statusCode).toBe(200);
    expect((await listed()).find((x) => x.id === p!.id)?.axis_start_cm).toBe(20);
  });

  it('megkezdett vagy rögzített ültetés nem törölhető, semmi sem változik', async () => {
    const msg = 'Megkezdett vagy rögzített ültetés a kiosztásból nem törölhető; a részletes lapon törölhető.';
    const other: Bed = (
      await app.inject({ method: 'POST', url: '/api/beds', payload: { name: 'Emelt 2', length_cm: 200, width_cm: 80, bed_type: 'emelt' } })
    ).json();
    // közvetlenül az adatbázisban, egyenként: a státusz „terv” marad, ha nem az a jel
    const setColumn = (set: string) => (id: number) => void db.prepare(`UPDATE planting SET ${set} WHERE id = ?`).run(id);
    for (const [név, mark] of [
      ['tényleges dátum (tervezett státusszal)', setColumn("actual_end_date = '2029-09-01'")],
      ['gyors előzmény', setColumn('is_history = 1')],
      ['sikertelen', setColumn("status = 'sikertelen'")],
      ['elmaradt', setColumn("status = 'elmaradt'")],
      ['tényleges hely', setColumn('actual_axis_start_cm = 10')],
      ['máshol valósult meg (tényleges ágyás, dátum és hely nélkül)', setColumn(`actual_bed_id = ${other.id}`)],
    ] as const) {
      const [keep]: PlantingListItem[] = (await post(basil({ axis_start_cm: 0 }))).json();
      const [fixed]: PlantingListItem[] = (await post(basil({ axis_start_cm: 30 }))).json();
      mark(fixed!.id);
      const status = (db.prepare('SELECT status FROM planting WHERE id = ?').get(fixed!.id) as { status: string }).status;
      if (!['sikertelen', 'elmaradt'].includes(név)) expect(status, név).toBe('terv');
      const before = await listed();
      const res = await batch({ delete: [keep!.id, fixed!.id] });
      expect(res.statusCode, név).toBe(400);
      expect(res.json().error, név).toBe(msg);
      expect(await listed(), név).toEqual(before);
      // a rögzített ültetés megmaradt
      expect(db.prepare('SELECT 1 FROM planting WHERE id = ?').get(fixed!.id), név).toBeDefined();
    }
  });
});
