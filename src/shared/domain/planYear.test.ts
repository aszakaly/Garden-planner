import { describe, expect, it } from 'vitest';
import { blankPlanting, occupancyPeriod } from './plantings.ts';
import { carriedPlanting, defaultPlanYearStatus, harvestMovesToCarry, isCarryCandidate } from './planYear.ts';

const eper = {
  ...blankPlanting(),
  id: 7,
  year: 2026,
  plant_id: 3,
  plant_name: 'Eper',
  perennial: true,
  method: 'ultetes' as const,
  bed_id: 1,
  axis_start_cm: 0,
  axis_span_cm: 60,
  plan_sow_date: '2026-04-10',
  plan_harvest_start: '2026-05-20',
};

describe('tervév', () => {
  it('az alapállapot az évből adódik', () => {
    expect(defaultPlanYearStatus(2027, 2026)).toBe('tervezes');
    expect(defaultPlanYearStatus(2026, 2026)).toBe('aktiv');
    expect(defaultPlanYearStatus(2025, 2026)).toBe('lezart');
  });

  it('csak az előző évben álló, felszámolás nélküli évelő vihető át', () => {
    expect(isCarryCandidate(eper, 2027)).toBe(true);
    expect(isCarryCandidate(eper, 2028)).toBe(false);
    expect(isCarryCandidate({ ...eper, perennial: false }, 2027)).toBe(false);
    expect(isCarryCandidate({ ...eper, status: 'sikertelen' }, 2027)).toBe(false);
    expect(isCarryCandidate({ ...eper, actual_end_date: '2026-09-01' }, 2027)).toBe(false);
  });

  it('az áthozott ültetés a tényleges helyen, január 1-jétől foglal, a betakarítás az időszakból jön', () => {
    const moved = { ...eper, actual_bed_id: 2, actual_axis_start_cm: 100, actual_axis_span_cm: 40 };
    const c = carriedPlanting(moved, 2027, { harvest_start: '05-15' });
    expect(c).toMatchObject({ year: 2027, bed_id: 2, axis_start_cm: 100, axis_span_cm: 40, plan_harvest_start: '2027-05-15', carried_from_id: 7 });
    expect(occupancyPeriod({ ...blankPlanting(), ...c, method: 'ultetes', perennial: true })).toEqual({ start: '2027-01-01', end: '2027-12-31' });
  });

  it('időszak nélkül a tavalyi betakarítás napját veszi át', () => {
    expect(carriedPlanting({ ...eper, actual_harvest_start: '2026-05-28' }, 2027).plan_harvest_start).toBe('2027-05-28');
  });

  it('a nyár végén telepített évelő jövő évi betakarítását az áthozott ültetés veszi át', () => {
    const late = { ...eper, plan_sow_date: '2026-08-20', plan_harvest_start: '2027-05-15' };
    expect(harvestMovesToCarry(late, 2027)).toBe(true);
    expect(carriedPlanting(late, 2027, { harvest_start: '05-20' }).plan_harvest_start).toBe('2027-05-15');
    // Az évelő foglaltsága a telepítés évében az év végéig tart, nem a betakarítás utánig
    expect(occupancyPeriod(late)).toEqual({ start: '2026-08-20', end: '2026-12-31' });
  });
});
