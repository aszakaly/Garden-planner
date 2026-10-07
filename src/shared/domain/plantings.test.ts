import { describe, expect, it } from 'vitest';
import type { PlantingListItem } from '../types.ts';
import { EMPTY_DATES } from './dates.ts';
import { bedStartField, blankPlanting, occupancyPeriod, startedOrRecorded } from './plantings.ts';

const planting = (o: Partial<PlantingListItem> = {}): PlantingListItem => ({
  ...blankPlanting(),
  id: 1, year: 2027, plant_id: 8, bed_id: 1, method: 'helyrevetes',
  plan_sow_date: '2027-03-20', plan_harvest_start: '2027-05-09', plan_end_date: '2027-06-05',
  ...o,
});

describe('megkezdett vagy rögzített ültetés', () => {
  it('a meg nem kezdett terv nem az', () => {
    expect(startedOrRecorded(planting())).toBe(false);
  });

  const cases: [string, Partial<PlantingListItem>][] = [
    ['gyors előzmény', { is_history: true }],
    ['folyamatban van', { status: 'folyamatban' }],
    ['lezárt', { status: 'lezart' }],
    ['elmaradt', { status: 'elmaradt' }],
    ['sikertelen', { status: 'sikertelen' }],
    ['tényleges vetés', { actual_sow_date: '2027-03-22' }],
    ['tényleges kiültetés', { actual_transplant_date: '2027-05-12' }],
    ['tényleges betakarítás', { actual_harvest_start: '2027-05-15' }],
    ['tényleges vég', { actual_end_date: '2027-06-01' }],
    ['tényleges hely', { actual_axis_start_cm: 0, actual_axis_span_cm: 40 }],
    ['máshol valósult meg (tényleges ágyás, dátum és hely nélkül)', { actual_bed_id: 2 }],
  ];
  for (const [név, o] of cases) {
    it(`az, ha ${név}`, () => {
      expect(startedOrRecorded(planting(o))).toBe(true);
    });
  }
});

describe('az ágyásba kerülés dátuma', () => {
  const d = (sow: string | null, transplant: string | null) => ({ ...EMPTY_DATES, sow, transplant });

  it('a módszer szerinti: palántánál a kiültetés, egyébként a vetés', () => {
    expect(bedStartField('palanta', d('2027-03-15', '2027-05-10'))).toBe('transplant');
    expect(bedStartField('vasarolt_palanta', d(null, '2027-05-10'))).toBe('transplant');
    expect(bedStartField('helyrevetes', d('2027-03-15', '2027-05-10'))).toBe('sow');
  });

  it('ennek híján a másik dátum; módszer nélkül a kiültetés, majd a vetés', () => {
    expect(bedStartField('palanta', d('2027-03-15', null))).toBe('sow');
    expect(bedStartField('helyrevetes', d(null, '2027-05-10'))).toBe('transplant');
    expect(bedStartField(null, d('2027-03-15', '2027-05-10'))).toBe('transplant');
    expect(bedStartField(null, d('2027-03-15', null))).toBe('sow');
    expect(bedStartField(null, d(null, null))).toBeNull();
  });

  it('a foglaltság ugyanettől a naptól számít', () => {
    const p = planting({ method: null, plan_sow_date: null, actual_transplant_date: '2027-04-01' });
    expect(occupancyPeriod(p)?.start).toBe('2027-04-01');
  });
});
