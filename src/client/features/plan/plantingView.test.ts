import { describe, expect, it } from 'vitest';
import { plantingInput } from '@shared/schemas.ts';
import type { PlantingListItem } from '@shared/types.ts';
import { blankPlanting, linkedUpdate, plantingInputOf } from './plantingView.ts';

describe('plantingInputOf', () => {
  it('a bemeneti séma minden mezőjét kitölti (egy új mező nem nullázódhat le csendben a teljes cserénél)', () => {
    expect(Object.keys(plantingInputOf(blankPlanting())).sort()).toEqual(Object.keys(plantingInput.shape).sort());
  });
});

describe('linkedUpdate', () => {
  // A szerkesztett sáv mentés előtti állapota és egy vele kapcsolt pár (más hellyel, vetőmaggal és időszakkal)
  const before: PlantingListItem = {
    ...blankPlanting(),
    id: 1,
    year: 2027,
    plant_id: 5,
    variety_id: 10,
    seed_stock_id: 100,
    window_id: 20,
    method: 'helyrevetes',
    plan_sow_date: '2027-04-01',
    plan_harvest_start: '2027-06-01',
    plan_end_date: '2027-07-15',
    bed_id: 3,
    axis_start_cm: 0,
    axis_span_cm: 30,
    rows: 2,
    plant_count: 40,
    notes: 'első sáv',
  };
  const pair: PlantingListItem = {
    ...before,
    id: 2,
    seed_stock_id: 101,
    window_id: 21,
    axis_start_cm: 60,
    axis_span_cm: 45,
    cross_start_cm: 10,
    cross_span_cm: 40,
    rows: 3,
    plant_count: 55,
    notes: 'harmadik sáv',
  };
  const PLACE = ['bed_id', 'axis_start_cm', 'axis_span_cm', 'cross_start_cm', 'cross_span_cm', 'rows', 'plant_count', 'notes'] as const;

  it('a megváltozott dátumok átkerülnek, a pár helye, sorai, tőszáma, megjegyzése, vetőmagja és időszaka marad', () => {
    const update = {
      ...plantingInputOf(before),
      plan_sow_date: '2027-04-10',
      plan_harvest_start: '2027-06-10',
      plan_end_date: '2027-07-24',
      axis_start_cm: 15,
      rows: 1,
      plant_count: 20,
      notes: 'átírva',
    };
    const data = linkedUpdate(pair, update, before)!;
    expect(data).toEqual({ ...plantingInputOf(pair), plan_sow_date: '2027-04-10', plan_harvest_start: '2027-06-10', plan_end_date: '2027-07-24' });
    for (const k of PLACE) expect(data[k]).toBe(plantingInputOf(pair)[k]);
    expect(data.seed_stock_id).toBe(101);
    expect(data.window_id).toBe(21);
  });

  it('a megváltozott fajta, vetőmag és időszak követi a szerkesztett sávot', () => {
    const update = { ...plantingInputOf(before), variety_id: 11, seed_stock_id: 110, window_id: 22 };
    const data = linkedUpdate(pair, update, before)!;
    expect(data).toMatchObject({ variety_id: 11, seed_stock_id: 110, window_id: 22 });
    for (const k of PLACE) expect(data[k]).toBe(plantingInputOf(pair)[k]);
  });

  it('fajtaváltáskor a vetőmag akkor is követi, ha a szerkesztett sávon nem változott (a régi fajta tétele nem maradhat)', () => {
    const noStock = { ...before, seed_stock_id: null };
    const update = { ...plantingInputOf(noStock), variety_id: 11 };
    expect(linkedUpdate(pair, update, noStock)).toMatchObject({ variety_id: 11, seed_stock_id: null, window_id: 21 });
  });

  it('módszerváltáskor a vetőmag is követi (vetés nélkül nincs vetőmag)', () => {
    const update = { ...plantingInputOf(before), method: 'vasarolt_palanta' as const, seed_stock_id: null, plan_sow_date: null, plan_transplant_date: '2027-05-01' };
    expect(linkedUpdate(pair, update, before)).toMatchObject({
      method: 'vasarolt_palanta',
      seed_stock_id: null,
      plan_sow_date: null,
      plan_transplant_date: '2027-05-01',
      window_id: 21,
    });
  });

  it('ha az átvihető mezők közül semmi nem változott, null (a hiányzó és az üres érték azonos)', () => {
    expect(linkedUpdate(pair, plantingInputOf(before), before)).toBeNull();
    const update = { ...plantingInputOf(before), plan_transplant_date: undefined, axis_start_cm: 15, rows: 1, plant_count: 20, notes: 'átírva' };
    expect(linkedUpdate(pair, update, before)).toBeNull();
  });
});
