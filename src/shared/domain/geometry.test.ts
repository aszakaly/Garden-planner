import { describe, expect, it } from 'vitest';
import {
  alongLength,
  bedAxes,
  estimatePlantCount,
  findClashes,
  firstFreeStart,
  freeAxisRanges,
  outsideBed,
  rowsForSpan,
  spanForRows,
  type Occupant,
} from './geometry.ts';
import { occupancyPeriod, placeSeries, placementOf } from './plantings.ts';
import type { Planting } from '../types.ts';

const bed = { length_cm: 400, width_cm: 120, row_direction: 'keresztben' as const };
const full = { cross_start_cm: 0, cross_span_cm: 120 };
const occ = (id: number, start: number, span: number, from: string, to: string, cross = full): Occupant & { id: number } => ({
  id,
  placement: { axis_start_cm: start, axis_span_cm: span, ...cross },
  period: { start: from, end: to },
});

describe('sávok az ágyásban', () => {
  it('a tengely a sorok irányától függ', () => {
    expect(bedAxes(bed)).toEqual({ axis: 400, cross: 120 });
    expect(bedAxes({ ...bed, row_direction: 'hosszaban' })).toEqual({ axis: 120, cross: 400 });
  });

  it('sorok ↔ sávszélesség, becsült tőszám', () => {
    expect(spanForRows(3, 25)).toBe(75);
    expect(rowsForSpan(75, 25)).toBe(3);
    expect(rowsForSpan(60, 25)).toBe(2);
    expect(estimatePlantCount(2, 120, 50)).toBe(4);
    expect(estimatePlantCount(1, 30, 50)).toBe(1);
    expect(estimatePlantCount(2, 120, null)).toBeNull();
  });

  it('a sáv helye az ágyás hossza mentén a sorok irányától függetlenül', () => {
    const p = { axis_start_cm: 0, axis_span_cm: 100, cross_start_cm: 0, cross_span_cm: 250 };
    expect(alongLength(p, { length_cm: 600, width_cm: 100, row_direction: 'hosszaban' })).toEqual({
      start: 0, span: 250, widthStart: 0, widthSpan: 100,
    });
    expect(alongLength(p, bed)).toEqual({ start: 0, span: 100, widthStart: 0, widthSpan: 250 });
  });

  it('kilógó sáv', () => {
    expect(outsideBed({ axis_start_cm: 350, axis_span_cm: 75, ...full }, bed)).toBe(true);
    expect(outsideBed({ axis_start_cm: 325, axis_span_cm: 75, ...full }, bed)).toBe(false);
  });
});

describe('ütközés térben és időben', () => {
  const salad = occ(1, 0, 60, '2027-03-20', '2027-06-10');
  const tomato = occ(2, 40, 80, '2027-05-10', '2027-10-12');
  const beans = occ(3, 0, 60, '2027-06-10', '2027-08-08');
  const radish = occ(4, 120, 45, '2027-03-01', '2027-04-13');

  it('átfedő hely és idő ütközik; a felszabadulás napján a hely újra használható', () => {
    expect(findClashes([salad, tomato, beans, radish])).toEqual([
      { a: 1, b: 2, period: { start: '2027-05-10', end: '2027-06-10' } },
      { a: 2, b: 3, period: { start: '2027-06-10', end: '2027-08-08' } },
    ]);
  });

  it('keresztirányban egymás mellett nem ütközik', () => {
    const left = occ(5, 0, 60, '2027-04-01', '2027-06-01', { cross_start_cm: 0, cross_span_cm: 60 });
    const right = occ(6, 0, 60, '2027-04-01', '2027-06-01', { cross_start_cm: 60, cross_span_cm: 60 });
    expect(findClashes([left, right])).toEqual([]);
  });

  it('szabad szakaszok és az első szabad hely egy időszakra', () => {
    const period = { start: '2027-05-15', end: '2027-07-01' };
    const cross = { start: 0, span: 120 };
    expect(freeAxisRanges(400, [salad, tomato, radish], period, cross)).toEqual([[120, 400]]);
    expect(firstFreeStart(400, [salad, tomato, radish], period, 50, cross)).toBe(120);
    // Március elején csak a retek foglal
    expect(firstFreeStart(400, [salad, tomato, radish], { start: '2027-03-01', end: '2027-03-15' }, 100, cross)).toBe(0);
    expect(firstFreeStart(400, [occ(9, 0, 400, '2027-01-01', '2027-12-31')], period, 10, cross)).toBeNull();
  });
});

describe('újravetés-sorozat elhelyezése', () => {
  it('minden vetés a következő szabad sávba kerül, a felszabadult helyet újra használja', () => {
    // Retek: 45 cm sáv, 43 napig foglal, kéthetente vetve
    const first = occ(0, 0, 45, '2027-03-01', '2027-04-13');
    const placed = placeSeries(first, [0, 14, 28, 42, 56], 400, []);
    expect(placed.map((p) => p.placement.axis_start_cm)).toEqual([0, 45, 90, 135, 0]);
    expect(placed.map((p) => p.period.start)).toEqual(['2027-03-01', '2027-03-15', '2027-03-29', '2027-04-12', '2027-04-26']);
  });

  it('ha nincs szabad sáv, az első tag helyére kerül (ütközésként jelezve)', () => {
    const first = occ(0, 0, 45, '2027-03-01', '2027-04-13');
    const placed = placeSeries(first, [0, 14, 28], 90, []);
    expect(placed.map((p) => p.placement.axis_start_cm)).toEqual([0, 45, 0]);
    expect(findClashes(placed.map((p, i) => ({ ...p, id: i })))).toHaveLength(1);
  });
});

describe('ültetés foglaltsága', () => {
  const p = {
    year: 2027, method: 'palanta', status: 'terv',
    plan_sow_date: '2027-03-15', plan_transplant_date: '2027-05-10', plan_harvest_start: '2027-07-14', plan_end_date: null,
    actual_sow_date: null, actual_transplant_date: '2027-05-14', actual_harvest_start: null, actual_end_date: null,
  } as Planting;

  it('palántánál a kiültetéstől foglal, a tény dátum felülírja a tervet', () => {
    expect(occupancyPeriod(p)).toEqual({ start: '2027-05-14', end: '2027-08-13' });
  });

  it('elmaradt vagy dátum nélküli ültetés nem foglal', () => {
    expect(occupancyPeriod({ ...p, status: 'elmaradt' })).toBeNull();
    expect(occupancyPeriod({ ...p, plan_sow_date: null, plan_transplant_date: null, actual_transplant_date: null })).toBeNull();
  });

  it('elhelyezés: keresztirányban alapból a teljes szélesség', () => {
    const placed = { axis_start_cm: 10, axis_span_cm: 50, cross_start_cm: null, cross_span_cm: null } as Planting;
    expect(placementOf(placed, bed)).toEqual({ axis_start_cm: 10, axis_span_cm: 50, cross_start_cm: 0, cross_span_cm: 120 });
    expect(placementOf({ ...placed, axis_start_cm: null }, bed)).toBeNull();
  });
});
