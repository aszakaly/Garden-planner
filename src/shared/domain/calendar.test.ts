import { describe, expect, it } from 'vitest';
import { dayOfYear, windowSegments } from './calendar.ts';
import type { GrowingWindow } from '../types.ts';

const base: GrowingWindow = {
  id: 1, plant_id: 1, variety_id: null, season: 'tavaszi', method: 'helyrevetes',
  sow_start: null, sow_end: null, seedling_weeks: null, transplant_start: null, transplant_end: null,
  harvest_start: null, harvest_end: null, harvest_year_offset: 0, succession_days: null, notes: null,
};

describe('dayOfYear', () => {
  it('az év napjait számolja nem szökőévre', () => {
    expect(dayOfYear('01-01')).toBe(0);
    expect(dayOfYear('03-01')).toBe(59);
    expect(dayOfYear('12-31')).toBe(364);
    expect(dayOfYear('02-29')).toBe(58);
  });
});

describe('windowSegments', () => {
  it('palántánál tálcás vetés, kiültetés és betakarítás szakaszt ad', () => {
    const segs = windowSegments({
      ...base, method: 'palanta', sow_start: '02-20', sow_end: '03-31', seedling_weeks: 8,
      transplant_start: '05-10', transplant_end: '05-31', harvest_start: '07-10', harvest_end: '10-15',
    });
    expect(segs.map((s) => s.kind)).toEqual(['vetes_talcaba', 'kiultetes', 'betakaritas']);
    expect(segs.every((s) => !s.nextYear && s.start < s.end)).toBe(true);
  });

  it('évhatáron átnyúló betakarítást kettévág (fodros kel)', () => {
    const segs = windowSegments({ ...base, sow_start: '06-01', sow_end: '06-30', harvest_start: '09-15', harvest_end: '02-28' });
    const harvest = segs.filter((s) => s.kind === 'betakaritas');
    expect(harvest).toHaveLength(2);
    expect(harvest[0]).toMatchObject({ end: 1, nextYear: false });
    expect(harvest[1]).toMatchObject({ start: 0, nextYear: true });
  });

  it('áttelelő kultúra betakarítása a következő évre esik (fokhagyma)', () => {
    const segs = windowSegments({
      ...base, season: 'attelelo', method: 'ultetes', sow_start: '10-01', sow_end: '11-10',
      harvest_start: '06-20', harvest_end: '07-20', harvest_year_offset: 1,
    });
    expect(segs.find((s) => s.kind === 'ultetes')!.nextYear).toBe(false);
    expect(segs.find((s) => s.kind === 'betakaritas')!.nextYear).toBe(true);
  });
});
