import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase } from './db/index.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';
import { companionIndex, type CompanionPair } from '../shared/domain/companions.ts';
import { checkYear, uniqueIssues, type ChecksContext } from '../shared/domain/plantingChecks.ts';
import { DEFAULT_SETTINGS } from '../shared/settings.ts';
import type { Bed, PlantFamily, PlantListItem, PlantingListItem } from '../shared/types.ts';

/** A vetésforgó- és társításellenőrzés valódi adatokkal, az API-n keresztül felvett ültetésekre. */

let app: FastifyInstance;
let plants: PlantListItem[];
let bed: Bed;
const plantId = (code: string) => plants.find((p) => p.code === code)!.id;
const post = async (payload: object): Promise<PlantingListItem> => {
  const res = await app.inject({ method: 'POST', url: '/api/plantings', payload });
  expect(res.statusCode).toBe(201);
  return res.json()[0];
};
const strip = (start: number, span: number) => ({ axis_start_cm: start, axis_span_cm: span });

async function context(year: number): Promise<ChecksContext> {
  const families: PlantFamily[] = (await app.inject({ url: '/api/families' })).json();
  const companions: CompanionPair[] = (await app.inject({ url: '/api/companions' })).json();
  return {
    all: (await app.inject({ url: `/api/plantings?year=${year}&from_year=${year - 6}` })).json(),
    beds: (await app.inject({ url: `/api/beds?year=${year}` })).json(),
    families: new Map(families.map((f) => [f.id, f])),
    companions: companionIndex(companions),
    frost: DEFAULT_SETTINGS,
    currentYear: 2026,
  };
}

let tomato: PlantingListItem;
let fennel: PlantingListItem;
let tomatoFar: PlantingListItem;

beforeAll(async () => {
  app = buildApp({ db: (() => { const db = openDatabase(':memory:'); seedIfEmpty(db); return db; })() });
  plants = (await app.inject({ url: '/api/plants' })).json();
  bed = (await app.inject({ method: 'POST', url: '/api/beds', payload: { name: 'Emelt 1', length_cm: 400, width_cm: 120 } })).json();

  // Gyors előzmények: csak év és növény (2025: burgonya az egész ágyásban), illetve sávval (2026: paradicsom)
  await post({ year: 2025, plant_id: plantId('burgonya'), bed_id: bed.id, is_history: true });
  await post({ year: 2026, plant_id: plantId('paradicsom'), bed_id: bed.id, is_history: true, ...strip(0, 80) });

  const summer = { method: 'palanta', plan_transplant_date: '2027-05-10', plan_harvest_start: '2027-07-14', plan_end_date: '2027-10-12' };
  tomato = await post({ year: 2027, plant_id: plantId('paradicsom'), bed_id: bed.id, ...strip(0, 80), ...summer });
  fennel = await post({
    year: 2027, plant_id: plantId('edeskomeny'), bed_id: bed.id, method: 'helyrevetes', ...strip(80, 40),
    plan_sow_date: '2027-06-01', plan_harvest_start: '2027-08-20', plan_end_date: '2027-10-01',
  });
  tomatoFar = await post({ year: 2027, plant_id: plantId('paradicsom'), bed_id: bed.id, ...strip(300, 80), ...summer });
});

describe('ellenőrzések az év ültetéseire', () => {
  it('az előzmények lekérhetők több évre visszamenőleg', async () => {
    const ctx = await context(2027);
    expect(ctx.all.map((p) => p.year)).toEqual([2025, 2026, 2027, 2027, 2027]);
    expect(ctx.all[0]).toMatchObject({ is_history: true, status: 'lezart' });
  });

  it('paradicsom tavaly ugyanott: kerülendő; a csak évvel rögzített burgonya is számít', async () => {
    const issues = checkYear(2027, await context(2027)).filter((i) => i.plantingId === tomato.id && i.category === 'vetesforgo');
    expect(issues.map((i) => [i.level, i.message.split(' – ')[0]])).toEqual([
      ['kerulendo', 'Paradicsom 2026-ban is itt volt'],
      ['figyelem', 'Burgonyafélék: legalább 3 évnek kell eltelnie, mielőtt ugyanoda kerülnek'],
      ['figyelem', 'Két egymást követő évben erős tápanyagigényű növény (2026-ban paradicsom)'],
    ]);
  });

  it('a tavalyi sávon kívül csak az egész ágyásra rögzített burgonya-előzmény számít', async () => {
    const issues = checkYear(2027, await context(2027)).filter((i) => i.plantingId === tomatoFar.id && i.category === 'vetesforgo');
    expect(issues.map((i) => i.message)).toEqual([
      'Burgonyafélék: legalább 3 évnek kell eltelnie, mielőtt ugyanoda kerülnek – 2025-ben burgonya volt itt (2028-tól lehet újra).',
    ]);
  });

  it('paradicsom mellé édeskömény: piros társítási jelzés mindkét oldalon, egyszer a listában', async () => {
    const issues = checkYear(2027, await context(2027)).filter((i) => i.category === 'tarsitas' && i.level !== 'ok');
    // A távolabbi paradicsomnál csak ágyástárs (tájékoztató); az édeskömény oldalán növényenként a legerősebb marad
    expect(issues.map((i) => [i.plantingId, i.level])).toEqual([
      [tomato.id, 'kerulendo'],
      [tomatoFar.id, 'info'],
      [fennel.id, 'kerulendo'],
    ]);
    expect(issues[0]!.message).toBe(
      'Kerülendő szomszéd: gumós édeskömény közvetlenül mellette áll – gátló anyagokat választ ki (allelopátia).',
    );
    expect(uniqueIssues(issues)).toHaveLength(2);
  });

  it('vetőmag és elhelyezés jelzései', async () => {
    const issues = checkYear(2027, await context(2027));
    expect(issues.filter((i) => i.plantingId === tomato.id && i.category === 'vetomag').map((i) => i.chip)).toEqual(['Nincs vetőmag']);
    expect(issues.some((i) => i.category === 'utkozes')).toBe(false);
  });
});
