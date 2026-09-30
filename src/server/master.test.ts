import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type DB } from './db/index.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';
import type { PlantDetail, PlantListItem } from '../shared/types.ts';

let db: DB;
let app: FastifyInstance;
let plants: PlantListItem[];
const byCode = (code: string) => plants.find((p) => p.code === code)!;

beforeAll(async () => {
  db = openDatabase(':memory:');
  expect(seedIfEmpty(db)).toBe(true);
  expect(seedIfEmpty(db)).toBe(false);
  app = buildApp({ db });
  plants = (await app.inject({ url: '/api/plants' })).json();
});

describe('kezdő törzsadatok', () => {
  it('betölti a növényeket, családokat, zöldségcsoportokat', async () => {
    expect(plants).toHaveLength(56);
    expect((await app.inject({ url: '/api/families' })).json()).toHaveLength(13);
    const groups = (await app.inject({ url: '/api/crop-groups' })).json();
    expect(groups.map((g: { code: string }) => g.code)).toContain('szar_virag');
  });

  it('a növény örökli a zöldségcsoport vetésforgó-szakaszát', () => {
    expect(byCode('paradicsom').rotation_stage).toBe('termes');
    expect(byCode('voroshagyma').rotation_stage).toBe('gyoker');
    expect(byCode('karfiol').rotation_stage).toBe('level');
    expect(byCode('bazsalikom').rotation_stage).toBeNull();
    expect(byCode('pak_choi').name_hu).toBe('Pak choi (bordás kel)');
  });

  it('több szezon és évhatáron átnyúló időszak', () => {
    expect(byCode('retek').windows.map((w) => w.season)).toEqual(['tavaszi', 'oszi']);
    const garlic = byCode('fokhagyma').windows.find((w) => w.season === 'attelelo')!;
    expect(garlic.harvest_year_offset).toBe(1);
  });

  it('társítások: paradicsom–bazsalikom kedvező, paradicsom–édeskömény kerülendő', async () => {
    const detail: PlantDetail = (await app.inject({ url: `/api/plants/${byCode('paradicsom').id}` })).json();
    const rel = (name: string) => detail.companions.find((c) => c.other_plant_name === name)?.relation;
    expect(rel('Bazsalikom')).toBe(1);
    expect(rel('Gumós édeskömény')).toBe(-1);
    expect(detail.companions[0]!.reason).toMatch(/\S/);
  });
});

describe('szerkesztés', () => {
  it('új növény létrehozása és érvénytelen adat elutasítása', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/plants',
      payload: { name_hu: 'Okra', nutrient_group: 1, frost_sensitive: true },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ code: 'okra', frost_sensitive: true, data_status: 'sajat' });

    const bad = await app.inject({ method: 'POST', url: '/api/plants', payload: { name_hu: '' } });
    expect(bad.statusCode).toBe(400);
  });

  it('időszak: palántánál kötelező a kiültetés, hiányos tartomány hiba', async () => {
    const pid = byCode('paradicsom').id;
    const missing = await app.inject({
      method: 'POST',
      url: `/api/plants/${pid}/windows`,
      payload: { season: 'nyari', method: 'palanta', sow: null, sow_start: '05-01', sow_end: '05-20' },
    });
    expect(missing.statusCode).toBe(400);

    const created = await app.inject({
      method: 'POST',
      url: `/api/plants/${pid}/windows`,
      payload: {
        season: 'nyari', method: 'palanta', sow_start: '05-01', sow_end: '05-20',
        seedling_weeks: 6, transplant_start: '06-15', transplant_end: '06-30',
      },
    });
    expect(created.statusCode).toBe(201);
  });

  it('fajta: egy növényen belül egyedi név', async () => {
    const url = `/api/plants/${byCode('paprika').id}/varieties`;
    expect((await app.inject({ method: 'POST', url, payload: { name: 'Kalocsai' } })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url, payload: { name: 'Kalocsai' } })).statusCode).toBe(409);
  });

  it('társítás felülírása mindkét irányból ugyanazt a párt módosítja', async () => {
    const a = byCode('paradicsom').id;
    const b = byCode('bazsalikom').id;
    await app.inject({
      method: 'PUT',
      url: '/api/companions',
      payload: { plant_a_id: b, plant_b_id: a, relation: 0, reason: 'Saját tapasztalat' },
    });
    const detail: PlantDetail = (await app.inject({ url: `/api/plants/${a}` })).json();
    const basil = detail.companions.find((c) => c.other_plant_id === b)!;
    expect(basil).toMatchObject({ relation: 0, source: 'user', reason: 'Saját tapasztalat' });
  });

  it('ültetésben szereplő növény nem törölhető', async () => {
    const pid = byCode('uborka').id;
    db.prepare('INSERT INTO planting (year, plant_id) VALUES (2026, ?)').run(pid);
    expect((await app.inject({ method: 'DELETE', url: `/api/plants/${pid}` })).statusCode).toBe(409);
  });
});
