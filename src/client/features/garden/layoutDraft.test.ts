import { describe, expect, it } from 'vitest';
import { rowsForSpan, type Placement } from '@shared/domain/geometry.ts';
import { linkedPlantings } from '@shared/domain/layout.ts';
import { blankPlanting } from '@shared/domain/plantings.ts';
import type { Bed, GrowingWindow, PlantListItem, PlantingListItem } from '@shared/types.ts';
import {
  addItem,
  applyFix,
  applyStrips,
  copyPlanting,
  draftFrom,
  isDirty,
  isFixed,
  placeItem,
  plantingFor,
  removeItem,
  stripsAt,
  toBatch,
  type LayoutDraft,
} from './layoutDraft.ts';

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
const pl = (axis_start_cm: number, axis_span_cm: number, cross_start_cm = 0, cross_span_cm = 200): Placement => ({
  axis_start_cm, axis_span_cm, cross_start_cm, cross_span_cm,
});

describe('pillanatkép', () => {
  it('a napon álló, elhelyezett ültetések; a más évhez tartozó rögzített', () => {
    const d = draft([tomato, salad, garlic]);
    expect(stripsAt(d, bed, 2027, '2027-04-12').map((s) => [s.key, s.fixed])).toEqual([[2, false], [3, true]]);
    expect(stripsAt(d, bed, 2027, '2027-07-01').map((s) => s.key)).toEqual([1]);
  });

  it('az elmaradt, a hely nélküli és a záró napján már szabad ültetés nem látszik', () => {
    const skipped = { ...salad, id: 4, status: 'elmaradt' as const };
    const unplaced = { ...salad, id: 5, axis_start_cm: null };
    const d = draft([salad, skipped, unplaced]);
    expect(stripsAt(d, bed, 2027, '2027-04-12').map((s) => s.key)).toEqual([2]);
    // a saláta helye jún. 5-én szabadul fel
    expect(stripsAt(d, bed, 2027, '2027-06-04').map((s) => s.key)).toEqual([2]);
    expect(stripsAt(d, bed, 2027, '2027-06-05')).toEqual([]);
  });
});

describe('rögzített sávok', () => {
  it('a tervezési év saját, meg nem kezdett ültetése szerkeszthető', () => {
    expect(isFixed(salad, 2027)).toBe(false);
  });

  const cases: [string, Partial<PlantingListItem>][] = [
    ['más évhez tartozik', { year: 2026 }],
    ['máshol valósult meg (tényleges ágyás, hely nélkül)', { actual_bed_id: 2 }],
    ['tényleges helye van', { actual_axis_start_cm: 0, actual_axis_span_cm: 40 }],
    ['folyamatban van', { status: 'folyamatban' }],
    ['tényleges dátuma van', { actual_sow_date: '2027-03-22' }],
    ['gyors előzmény', { is_history: true }],
    ['elmaradt', { status: 'elmaradt' }],
    ['lezárt', { status: 'lezart' }],
  ];
  for (const [név, o] of cases) {
    it(`rögzített, ha ${név}`, () => {
      expect(isFixed({ ...salad, ...o }, 2027)).toBe(true);
    });
  }

  it('a máshová áthelyezett ültetés a másik ágyás piszkozatában rögzített (a terv szerinti helyén látszik)', () => {
    const other: Bed = { ...bed, id: 2, name: 'Emelt 2' };
    const moved = { ...salad, actual_bed_id: 2 };
    expect(stripsAt(draftFrom([moved], other), other, 2027, '2027-04-12')).toEqual([{ key: 2, fixed: true, placement: pl(0, 40) }]);
  });
});

describe('visszaírás', () => {
  // sűrű sorok: 3 sor 40 cm-en, bár a 20 cm-es sortávhoz csak 2 járna
  const dense = { ...salad, rows: 3 };
  // egy visszaírás; a viszonyítási alap a mentett állapot (alapból maga az ültetés)
  const put = (p: PlantingListItem, placement: Placement, original: PlantingListItem[] = [p]) =>
    applyStrips(draft([p]), [{ key: p.id, placement }], bed, original).items[0]!;
  // húzás, mint a szerkesztőben: minden lépés a már módosított piszkozatra kerül, a mentett ültetés változatlan
  const drag = (p: PlantingListItem, spans: number[], original: PlantingListItem[] = [p]) =>
    spans.reduce((d, span) => applyStrips(d, [{ key: p.id, placement: pl(0, span) }], bed, original), draft([p])).items[0]!;
  const steps = (from: number, to: number) =>
    Array.from({ length: Math.abs(to - from) / 5 }, (_, i) => from + Math.sign(to - from) * 5 * (i + 1));

  it('a teljes hosszú sávnál üres a keresztirány', () => {
    expect(put(salad, pl(0, 60))).toMatchObject({ axis_span_cm: 60, cross_start_cm: null, cross_span_cm: null });
  });

  it('változatlan szélességnél a saját sorszám marad (tengely menti mozgatás, részleges hossz)', () => {
    expect(put(dense, pl(20, 40))).toMatchObject({ axis_start_cm: 20, axis_span_cm: 40, rows: 3 });
    expect(put(dense, pl(0, 40, 0, 100))).toMatchObject({ rows: 3, cross_start_cm: 0, cross_span_cm: 100 });
    // a piszkozatbeli sorszám is marad, akkor is, ha eltér a mentettől
    expect(put({ ...dense, rows: 5 }, pl(20, 40), [dense]).rows).toBe(5);
    // új sávnál és sorszám nélkül is
    expect(put(copyPlanting(dense, -1), pl(20, 40), []).rows).toBe(3);
    expect(put({ ...salad, rows: null }, pl(20, 40)).rows).toBeNull();
  });

  it('a sűrű sáv a mentett sűrűséggel arányosan változik, legalább egy sor marad', () => {
    expect(put(dense, pl(0, 80)).rows).toBe(6);
    expect(put(dense, pl(0, 20)).rows).toBe(2);
    expect(put(dense, pl(0, 10)).rows).toBe(1);
  });

  it('a lépésenkénti húzás ugyanoda jut, mint az egy ugrás', () => {
    expect(drag(dense, steps(40, 80)).rows).toBe(6);
    expect(drag(salad, steps(40, 80)).rows).toBe(put(salad, pl(0, 80)).rows);
    expect(drag(tomato, steps(30, 80)).rows).toBe(put(tomato, pl(0, 80)).rows);
    // minden köztes lépés is a mentett állapotból számol
    for (const span of steps(40, 80)) expect(drag(dense, steps(40, span)).rows, `${span} cm`).toBe(put(dense, pl(0, span)).rows);
  });

  it('oda-vissza húzva visszaáll a mentett sorszám', () => {
    expect(drag(dense, [...steps(40, 10), ...steps(10, 40)]).rows).toBe(3);
    expect(drag(salad, [...steps(40, 10), ...steps(10, 40)]).rows).toBe(2);
  });

  it('az egysoros sáv szélesítése a sortávot követi', () => {
    // 1 sor 30 cm-en, 35 cm-es sortáv: 80 cm-en 2 sor fér el (arányosan 3 lenne)
    expect(put(tomato, pl(0, 80)).rows).toBe(2);
    // 1 sor 10 cm-en, 20 cm-es sortáv: 15 cm-en sem lesz 7,5 cm-es sorköz
    const narrow = { ...salad, rows: 1, axis_span_cm: 10 };
    expect(put(narrow, pl(0, 15)).rows).toBe(1);
    expect(drag(narrow, steps(10, 40)).rows).toBe(2);
  });

  it('a sortáv szerinti sűrűségű sáv a sortávot követi', () => {
    expect(put(salad, pl(0, 60)).rows).toBe(3);
    expect(put(salad, pl(0, 30)).rows).toBe(1);
  });

  it('a sűrű sáv sosem ritkább a sortáv szerintinél', () => {
    const wide = { ...salad, rows: 3, axis_span_cm: 55 };
    for (const span of [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 65, 70, 75, 80]) {
      expect(put(wide, pl(0, span)).rows, `${span} cm`).toBeGreaterThanOrEqual(rowsForSpan(span, 20));
    }
  });

  it('mentett pár nélkül (új sáv) és sorszám nélkül a sortávból számol', () => {
    expect(put(copyPlanting(dense, -1), pl(0, 80), []).rows).toBe(4);
    expect(put({ ...salad, rows: null }, pl(0, 60)).rows).toBe(3);
  });

  it('a rögzített és a változatlan sávot érintetlenül hagyja', () => {
    const out = applyStrips(
      draft([tomato, garlic]),
      [{ key: 1, placement: pl(0, 30) }, { key: 3, fixed: true, placement: pl(0, 40) }],
      bed,
      [tomato, garlic],
    );
    expect(out.items[0]).toBe(tomato);
    expect(out.items[1]).toBe(garlic);
  });
});

describe('keresztben futó sorok', () => {
  // 200 × 80 cm, keresztben: a tengely az ágyás hossza, egy sor az ágyás szélessége (80 cm)
  const across: Bed = { ...bed, row_direction: 'keresztben' };
  const radish = item(4, {
    method: 'helyrevetes', row_spacing_cm: 15, rows: 2, axis_start_cm: 100, axis_span_cm: 30,
    plan_sow_date: '2027-04-01', plan_harvest_start: '2027-05-01', plan_end_date: '2027-05-20',
  });

  it('a keresztirány nélküli sáv az ágyás teljes szélességében áll', () => {
    expect(stripsAt(draft([radish]), across, 2027, '2027-04-12')).toEqual([{ key: 4, fixed: false, placement: pl(100, 30, 0, 80) }]);
  });

  it('a 80 cm-es sor teljes hosszú, a rövidebb részleges', () => {
    expect(placeItem(radish, pl(100, 30, 0, 80), across)).toMatchObject({ cross_start_cm: null, cross_span_cm: null });
    expect(placeItem(radish, pl(100, 30, 0, 40), across)).toMatchObject({ cross_start_cm: 0, cross_span_cm: 40 });
    // hosszában futó soroknál ugyanez a 80 cm részleges
    expect(placeItem(radish, pl(0, 30, 0, 80), bed)).toMatchObject({ cross_start_cm: 0, cross_span_cm: 80 });
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
    expect(copy).toMatchObject({
      id: -5, status: 'terv', is_history: false, actual_transplant_date: null, notes: null, plan_transplant_date: '2027-05-10',
    });
    expect(linkedPlantings(copy, [started, copy]).map((p) => p.id)).toEqual([1]);
    // a gyors előzmény másolata sem előzmény (a szerver lezártként mentené)
    expect(copyPlanting({ ...tomato, is_history: true }, -6).is_history).toBe(false);
  });
});

describe('felvétel és törlés', () => {
  it('a piszkozat kiosztja az új azonosítókat: egymás után felvéve különbözők', () => {
    let d = draftFrom([tomato, salad, item(9, { bed_id: 2 })], bed);
    expect(d).toEqual({ items: [tomato, salad], deleted: [], nextId: -1 });
    d = addItem(d, copyPlanting(salad, d.nextId));
    d = addItem(d, copyPlanting(tomato, d.nextId));
    expect(d.items.map((p) => p.id)).toEqual([1, 2, -1, -2]);
    expect(d.nextId).toBe(-3);
    expect(toBatch([tomato, salad], d).create).toHaveLength(2);
  });

  it('mentett ültetés felvétele nem változtat a következő azonosítón', () => {
    expect(addItem(draft([]), tomato).nextId).toBe(-1);
  });

  it('az ismételt törlés egyszer szerepel', () => {
    const d = removeItem(removeItem(draft([tomato, salad]), 1), 1);
    expect(d.deleted).toEqual([1]);
    expect(toBatch([tomato, salad], d).delete).toEqual([1]);
  });

  it('a piszkozatban nem szereplő ültetés törlése nem kerül a törlendők közé', () => {
    expect(removeItem(draft([tomato]), 99).deleted).toEqual([]);
  });

  it('a mentés előtt törölt új sáv sem létrehozásként, sem törlésként nem szerepel', () => {
    const d = removeItem(addItem(draft([tomato]), copyPlanting(tomato, -1)), -1);
    const b = toBatch([tomato], d);
    expect(b.create).toEqual([]);
    expect(b.delete).toEqual([]);
    expect(isDirty([tomato], d)).toBe(false);
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
