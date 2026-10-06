import { describe, expect, it } from 'vitest';
import { linkedPlantings } from '@shared/domain/layout.ts';
import { blankPlanting } from '@shared/domain/plantings.ts';
import type { Bed, GrowingWindow, PlantListItem, PlantingListItem } from '@shared/types.ts';
import { applyFix, applyStrips, copyPlanting, isDirty, plantingFor, stripsAt, toBatch, type LayoutDraft } from './layoutDraft.ts';

const bed: Bed = {
  id: 1, garden_id: 1, name: 'Emelt 1', color: 'green', length_cm: 200, width_cm: 80, row_direction: 'hosszaban',
  pos_x_cm: null, pos_y_cm: null, rotation_deg: 0, bed_type: 'emelt', sun: null, soil: null, irrigation: null,
  notes: null, active_from_year: null, active_to_year: null, sort_order: 0,
};
const item = (id: number, o: Partial<PlantingListItem>): PlantingListItem => ({ ...blankPlanting(), id, year: 2027, bed_id: 1, ...o });
const tomato = item(1, {
  plant_id: 7, plant_name: 'Paradicsom', method: 'palanta', row_spacing_cm: 35, rows: 1, axis_start_cm: 0, axis_span_cm: 30,
  plan_sow_date: '2027-03-15', plan_transplant_date: '2027-05-10', plan_harvest_start: '2027-07-14', plan_end_date: '2027-10-12',
});
const salad = item(2, {
  plant_id: 8, plant_name: 'Saláta', method: 'helyrevetes', row_spacing_cm: 20, rows: 2, axis_start_cm: 0, axis_span_cm: 40,
  plan_sow_date: '2027-03-20', plan_harvest_start: '2027-05-09', plan_end_date: '2027-06-05',
});
const garlic = item(3, {
  year: 2026, plant_id: 9, plant_name: 'Fokhagyma', method: 'ultetes', axis_start_cm: 40, axis_span_cm: 40,
  plan_sow_date: '2026-10-10', plan_harvest_start: '2027-06-01', plan_end_date: '2027-06-20',
});
const draft = (items: PlantingListItem[], o: Partial<LayoutDraft> = {}): LayoutDraft => ({ items, deleted: [], nextId: -1, ...o });

describe('pillanatkép', () => {
  it('a napon álló, elhelyezett ültetések; a más évhez tartozó rögzített', () => {
    const d = draft([tomato, salad, garlic]);
    expect(stripsAt(d, bed, 2027, '2027-04-12').map((s) => [s.key, s.fixed])).toEqual([[2, false], [3, true]]);
    expect(stripsAt(d, bed, 2027, '2027-07-01').map((s) => s.key)).toEqual([1]);
  });
});

describe('visszaírás', () => {
  it('a szélességből újraszámolja a sorokat, a teljes hosszú sávnál üres a keresztirány', () => {
    const out = applyStrips(draft([salad]), [{ key: 2, placement: { axis_start_cm: 0, axis_span_cm: 60, cross_start_cm: 0, cross_span_cm: 200 } }], bed);
    expect(out.items[0]).toMatchObject({ axis_span_cm: 60, rows: 3, cross_start_cm: null, cross_span_cm: null });
  });

  it('a részleges hosszt eltárolja, a változatlan szélességnél a sorok maradnak', () => {
    const out = applyStrips(draft([salad]), [{ key: 2, placement: { axis_start_cm: 0, axis_span_cm: 40, cross_start_cm: 0, cross_span_cm: 100 } }], bed);
    expect(out.items[0]).toMatchObject({ rows: 2, cross_start_cm: 0, cross_span_cm: 100 });
  });
});

describe('új sáv', () => {
  const win = (id: number, method: GrowingWindow['method'], w: Partial<GrowingWindow>): GrowingWindow => ({
    id, plant_id: 8, variety_id: null, season: 'tavaszi', method, sow_start: null, sow_end: null, seedling_weeks: null,
    transplant_start: null, transplant_end: null, harvest_start: null, harvest_end: null, harvest_year_offset: 0,
    succession_days: null, notes: null, ...w,
  });
  const lettuce = (windows: GrowingWindow[]): PlantListItem => ({
    id: 8, code: 'salata', name_hu: 'Saláta', name_latin: null, family_id: 5, crop_group_id: 3, rotation_stage: 'level',
    nutrient_group: 2, perennial: false, frost_sensitive: false, in_row_spacing_cm: 25, row_spacing_cm: 30,
    days_to_harvest: 50, harvest_duration_days: 20, seed_viability_years: 4, sun: null, aliases_en: [], notes: null,
    data_status: 'alapertek', source: null, family_name: 'Fészkesek', crop_group_name: 'Levélzöldségek', variety_count: 0, windows,
  });
  const ctx = { id: -1, year: 2027, bedId: 1, day: '2027-04-12', frost: { lastFrost: '05-10', firstFrost: '10-20' }, cropGroupCode: 'level' };

  it('a napon az ágyásban álló ablakból, egy sor szélességben', () => {
    const p = plantingFor(lettuce([win(1, 'palanta', { sow_start: '02-01', seedling_weeks: 6, transplant_start: '03-20' })]), ctx);
    expect(p).toMatchObject({
      id: -1, bed_id: 1, plant_id: 8, plant_name: 'Saláta', crop_group_code: 'level', window_id: 1, method: 'palanta',
      plan_sow_date: '2027-02-06', plan_transplant_date: '2027-03-20', plan_harvest_start: '2027-05-09', plan_end_date: '2027-05-29',
      rows: 1, axis_span_cm: 30,
    });
  });

  it('ablak nélkül helyrevetés a pillanatkép napján', () => {
    expect(plantingFor(lettuce([]), ctx)).toMatchObject({ method: 'helyrevetes', window_id: null, plan_sow_date: '2027-04-12' });
  });

  it('a másolat kapcsolt pár, tény adatok nélkül', () => {
    const started = { ...tomato, status: 'folyamatban' as const, actual_transplant_date: '2027-05-12', notes: 'jól eredt' };
    const copy = copyPlanting(started, -5);
    expect(copy).toMatchObject({ id: -5, status: 'terv', actual_transplant_date: null, notes: null, plan_transplant_date: '2027-05-10' });
    expect(linkedPlantings(copy, [started, copy]).map((p) => p.id)).toEqual([1]);
  });
});

describe('mentés', () => {
  it('létrehozás, módosítás és törlés a különbségből', () => {
    const moved = { ...tomato, axis_start_cm: 10 };
    const batch = toBatch([tomato, salad], draft([moved, copyPlanting(salad, -1)], { deleted: [2] }));
    expect(batch.create).toHaveLength(1);
    expect(batch.create[0]).toMatchObject({ plant_id: 8, year: 2027 });
    expect(batch.update).toEqual([{ id: 1, data: expect.objectContaining({ axis_start_cm: 10 }) }]);
    expect(batch.delete).toEqual([2]);
    expect(isDirty([tomato, salad], draft([tomato, salad]))).toBe(false);
  });

  it('ütközésjavítás: a vég előrehozása és a dátumok eltolása', () => {
    const d = draft([tomato, salad]);
    expect(applyFix(d, { kind: 'elozo_vege', plantingId: 2, date: '2027-05-10' }).items[1]!.plan_end_date).toBe('2027-05-10');
    expect(applyFix(d, { kind: 'kesobbi_eltolas', plantingId: 1, days: 26, date: '2027-06-05' }).items[0]).toMatchObject({
      plan_sow_date: '2027-04-10', plan_transplant_date: '2027-06-05', plan_harvest_start: '2027-08-09', plan_end_date: '2027-11-07',
    });
  });
});
