import { describe, expect, it } from 'vitest';
import type { GrowingWindow } from '../types.ts';
import {
  checkDates,
  completeDates,
  setDateShifting,
  suggestDates,
  suggestedSeriesCount,
  type CropTiming,
} from './dates.ts';
import { isoFromMonthDay, shortDate } from './isoDate.ts';

const frost = { lastFrost: '05-10', firstFrost: '10-20' };
const win = (w: Partial<GrowingWindow>): GrowingWindow => ({
  id: 1, plant_id: 1, variety_id: null, season: 'tavaszi', method: 'helyrevetes',
  sow_start: null, sow_end: null, seedling_weeks: null, transplant_start: null, transplant_end: null,
  harvest_start: null, harvest_end: null, harvest_year_offset: 0, succession_days: null, notes: null, ...w,
});
const crop = (c: Partial<CropTiming>): CropTiming => ({
  daysToHarvest: null, harvestDurationDays: null, frostSensitive: false, perennial: false, ...c,
});

const tomatoWindow = win({
  method: 'palanta', sow_start: '02-20', sow_end: '03-31', seedling_weeks: 8,
  transplant_start: '05-10', transplant_end: '05-31', harvest_start: '07-10', harvest_end: '10-15',
});
const tomato = crop({ daysToHarvest: 65, harvestDurationDays: 90, frostSensitive: true });

describe('suggestDates', () => {
  it('palánta: a vetést a kiültetésből számolja vissza a nevelési hetekkel', () => {
    expect(suggestDates({ year: 2027, window: tomatoWindow, method: 'palanta', crop: tomato, frost })).toEqual({
      sow: '2027-03-15',
      transplant: '2027-05-10',
      harvestStart: '2027-07-14',
      end: '2027-10-12',
    });
  });

  it('vásárolt palántánál nincs vetés', () => {
    const d = suggestDates({ year: 2027, window: tomatoWindow, method: 'vasarolt_palanta', crop: tomato, frost });
    expect(d.sow).toBeNull();
    expect(d.transplant).toBe('2027-05-10');
  });

  it('fagyérzékeny helyrevetés legkorábban az utolsó fagy napján (bokorbab)', () => {
    const bean = win({ sow_start: '05-01', sow_end: '07-10', harvest_start: '07-01', harvest_end: '09-30' });
    const d = suggestDates({
      year: 2027, window: bean, method: 'helyrevetes', crop: crop({ daysToHarvest: 60, harvestDurationDays: 30, frostSensitive: true }), frost,
    });
    expect(d).toEqual({ sow: '2027-05-10', transplant: null, harvestStart: '2027-07-09', end: '2027-08-08' });
  });

  it('a fagyérzékeny kultúra legkésőbb az első őszi fagyig foglal helyet', () => {
    const late = win({ sow_start: '06-15', sow_end: '07-05' });
    const d = suggestDates({
      year: 2027, window: late, method: 'helyrevetes', crop: crop({ daysToHarvest: 90, harvestDurationDays: 60, frostSensitive: true }), frost,
    });
    expect(d.harvestStart).toBe('2027-09-13');
    expect(d.end).toBe('2027-10-20');
  });

  it('áttelelő kultúra betakarítása a következő évre esik (fokhagyma)', () => {
    const garlic = win({ season: 'attelelo', method: 'ultetes', sow_start: '10-01', sow_end: '11-10', harvest_start: '06-20', harvest_end: '07-20', harvest_year_offset: 1 });
    const d = suggestDates({ year: 2026, window: garlic, method: 'ultetes', crop: crop({ daysToHarvest: 250, harvestDurationDays: 30 }), frost });
    expect(d).toEqual({ sow: '2026-10-01', transplant: null, harvestStart: '2027-06-20', end: '2027-07-20' });
  });

  it('több szezon: a retek tavaszi és őszi időszaka külön dátumokat ad', () => {
    const radish = crop({ daysToHarvest: 28, harvestDurationDays: 12 });
    const spring = suggestDates({ year: 2027, window: win({ sow_start: '03-01', sow_end: '04-30', harvest_start: '04-01', harvest_end: '06-10' }), method: 'helyrevetes', crop: radish, frost });
    const autumn = suggestDates({ year: 2027, window: win({ season: 'oszi', sow_start: '08-10', sow_end: '09-20', harvest_start: '09-10', harvest_end: '11-05' }), method: 'helyrevetes', crop: radish, frost });
    expect(spring).toMatchObject({ sow: '2027-03-01', harvestStart: '2027-04-01', end: '2027-04-13' });
    expect(autumn).toMatchObject({ sow: '2027-08-10', harvestStart: '2027-09-10', end: '2027-09-22' });
  });

  it('évelőnél nincs befejező dátum', () => {
    const d = suggestDates({ year: 2027, window: win({ method: 'ultetes', sow_start: '03-15', sow_end: '04-30' }), method: 'ultetes', crop: crop({ daysToHarvest: 60, perennial: true }), frost });
    expect(d.end).toBeNull();
    expect(d.harvestStart).toBe('2027-05-14');
  });
});

describe('dátum módosítása', () => {
  const base = { sow: '2027-03-15', transplant: '2027-05-10', harvestStart: '2027-07-14', end: '2027-10-12' };

  it('a későbbi dátumok ugyanannyival csúsznak, a korábbiak nem', () => {
    expect(setDateShifting(base, 'transplant', '2027-05-17')).toEqual({
      sow: '2027-03-15', transplant: '2027-05-17', harvestStart: '2027-07-21', end: '2027-10-19',
    });
  });

  it('üres dátum kitöltése nem csúsztat', () => {
    expect(setDateShifting({ ...base, sow: null }, 'sow', '2027-03-01')).toEqual({ ...base, sow: '2027-03-01' });
  });

  it('egyéni időszaknál a kezdőnapból kiegészíti a betakarítást', () => {
    const d = completeDates({ sow: '2027-04-01', transplant: null, harvestStart: null, end: null }, 'helyrevetes', crop({ daysToHarvest: 28, harvestDurationDays: 12 }), frost);
    expect(d).toEqual({ sow: '2027-04-01', transplant: null, harvestStart: '2027-04-29', end: '2027-05-11' });
  });
});

describe('checkDates', () => {
  it('fagyveszélyt jelez, ha a fagyérzékeny növény a fagyhatár előtt kerül ki', () => {
    const issues = checkDates({
      dates: { sow: '2027-03-01', transplant: '2027-04-25', harvestStart: '2027-06-29', end: '2027-09-27' },
      method: 'palanta', window: tomatoWindow, crop: tomato, frost,
    });
    expect(issues.map((i) => [i.level, i.field])).toContainEqual(['figyelem', 'transplant']);
    expect(issues.find((i) => i.field === 'transplant' && i.level === 'figyelem')!.message).toContain('máj. 10.');
    // a kiültetés a javasolt időszakon kívül is esik
    expect(issues.some((i) => i.field === 'transplant' && i.level === 'info')).toBe(true);
  });

  it('fordított sorrendű dátumokat hibának jelöli', () => {
    const issues = checkDates({
      dates: { sow: '2027-04-01', transplant: null, harvestStart: '2027-03-20', end: '2027-05-01' },
      method: 'helyrevetes', crop: crop({}), frost,
    });
    expect(issues).toEqual([expect.objectContaining({ level: 'kerulendo', field: 'harvestStart' })]);
    expect(issues[0]!.message).toBe('A betakarítás kezdete (márc. 20.) korábbra esik, mint a vetés (ápr. 1.).');
  });

  it('javasolt időn belüli, fagymentes terv rendben van', () => {
    const d = suggestDates({ year: 2027, window: tomatoWindow, method: 'palanta', crop: tomato, frost });
    expect(checkDates({ dates: d, method: 'palanta', window: tomatoWindow, crop: tomato, frost })).toEqual([]);
  });

  it('az ültetésnél „az” névelőt használ', () => {
    const garlic = win({ method: 'ultetes', sow_start: '10-01', sow_end: '11-10' });
    const [issue] = checkDates({ dates: { sow: '2027-12-01', transplant: null, harvestStart: null, end: null }, method: 'ultetes', window: garlic, crop: crop({}), frost });
    expect(issue!.message).toMatch(/^Az ültetés a javasolt időszakon/);
  });
});

describe('segédfüggvények', () => {
  it('újravetés: ennyi vetés fér a vetési időszak végéig', () => {
    expect(suggestedSeriesCount(win({ sow_start: '03-01', sow_end: '04-30' }), '2027-03-01', 14)).toBe(5);
    expect(suggestedSeriesCount(win({ sow_start: '03-01', sow_end: '04-30' }), '2027-04-25', 14)).toBe(1);
  });

  it('rövid magyar dátum és szökőnap', () => {
    expect(shortDate('2027-09-30')).toBe('szept. 30.');
    expect(shortDate('03-01')).toBe('márc. 1.');
    expect(isoFromMonthDay(2027, '02-29')).toBe('2027-02-28');
    expect(isoFromMonthDay(2028, '02-29')).toBe('2028-02-29');
  });
});
