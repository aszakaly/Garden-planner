import { describe, expect, it } from 'vitest';
import { rowsForSpan, type Placement } from '@shared/domain/geometry.ts';
import { linkedPlantings, splitStrip } from '@shared/domain/layout.ts';
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
  plantingFor,
  removeItem,
  replaceItem,
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
const draft = (items: PlantingListItem[], o: Partial<LayoutDraft> = {}): LayoutDraft => ({
  items, deleted: [], nextId: -1, rowBase: {}, ...o,
});
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
  // egy visszaírás a piszkozatba vett ültetésre
  const put = (p: PlantingListItem, placement: Placement) =>
    applyStrips(draftFrom([p], bed), [{ key: p.id, placement }], bed).items[0]!;
  // húzás, mint a szerkesztőben: minden lépés a már módosított piszkozatra kerül
  const drag = (d: LayoutDraft, id: number, spans: number[]) =>
    spans.reduce((acc, span) => applyStrips(acc, [{ key: id, placement: pl(0, span) }], bed), d);
  const steps = (from: number, to: number) =>
    Array.from({ length: Math.abs(to - from) / 5 }, (_, i) => from + Math.sign(to - from) * 5 * (i + 1));
  const rowsOf = (d: LayoutDraft, id: number) => d.items.find((p) => p.id === id)!.rows;
  // az ágyás tengelye 80 cm (hosszában futó sorok)
  const widths = Array.from({ length: 16 }, (_, i) => 5 * (i + 1));

  it('a teljes hosszú sávnál üres a keresztirány', () => {
    expect(put(salad, pl(0, 60))).toMatchObject({ axis_span_cm: 60, cross_start_cm: null, cross_span_cm: null });
  });

  it('változatlan szélességnél a sorszám marad (tengely menti mozgatás, részleges hossz), üresen is', () => {
    expect(put(dense, pl(20, 40))).toMatchObject({ axis_start_cm: 20, axis_span_cm: 40, rows: 3 });
    expect(put(dense, pl(0, 40, 0, 100))).toMatchObject({ rows: 3, cross_start_cm: 0, cross_span_cm: 100 });
    expect(put({ ...salad, rows: null }, pl(20, 40)).rows).toBeNull();
    expect(put({ ...salad, rows: null }, pl(0, 40, 0, 100)).rows).toBeNull();
    // a piszkozatbeli sorszám is marad, akkor is, ha eltér az alaptól
    const edited = draft([{ ...dense, rows: 5 }], { rowBase: { 2: { span: 40, rows: 3 } } });
    expect(applyStrips(edited, [{ key: 2, placement: pl(20, 40) }], bed).items[0]!.rows).toBe(5);
  });

  const cases: [string, PlantingListItem, Record<number, number | null>][] = [
    // a saját sorköznél a legközelebbi egész sorszám: 20 cm-en 1,5 → 2, 60 cm-en 4,5 → 5
    ['sűrű (3 sor 40 cm-en, 20 cm-es sortáv)', dense, { 10: 1, 20: 2, 30: 2, 45: 3, 55: 4, 60: 5, 80: 6 }],
    ['sortáv szerinti (2 sor 40 cm-en)', salad, { 10: 1, 30: 1, 45: 2, 60: 3, 80: 4 }],
    ['ritka (1 sor 60 cm-en, 20 cm-es sortáv)', { ...salad, rows: 1, axis_span_cm: 60 }, { 20: 1, 40: 1, 65: 1, 80: 1 }],
    ['sorszám nélküli (40 cm)', { ...salad, rows: null }, { 20: 1, 35: 1, 40: null, 45: 2, 60: 3, 80: 4 }],
  ];
  for (const [név, p, expected] of cases) {
    const start = p.axis_span_cm!;

    it(`${név}: a lépésenkénti húzás minden szélességen ugyanoda jut, mint az egy ugrás`, () => {
      for (const w of widths) {
        const stepped = rowsOf(drag(draftFrom([p], bed), p.id, steps(start, w)), p.id);
        expect(stepped, `${w} cm`).toBe(put(p, pl(0, w)).rows);
        if (w in expected) expect(stepped, `${w} cm`).toBe(expected[w]);
      }
    });

    it(`${név}: oda-vissza húzva visszaáll a sorszám, és nincs mentendő változás`, () => {
      for (const w of widths) {
        const back = drag(draftFrom([p], bed), p.id, [...steps(start, w), ...steps(w, start)]);
        expect(rowsOf(back, p.id), `${w} cm`).toBe(p.rows);
        expect(isDirty([p], back), `${w} cm`).toBe(false);
      }
    });
  }

  it('az egysoros sáv szélesítése a sortávot követi', () => {
    // 1 sor 30 cm-en, 35 cm-es sortáv: 80 cm-en 2 sor fér el
    expect(put(tomato, pl(0, 80)).rows).toBe(2);
    // 1 sor 10 cm-en, 20 cm-es sortáv: 15 cm-en sem lesz 7,5 cm-es sorköz, 40 cm-en sem 10 cm-es
    const narrow = { ...salad, rows: 1, axis_span_cm: 10 };
    expect(put(narrow, pl(0, 15)).rows).toBe(1);
    expect(rowsOf(drag(draftFrom([narrow], bed), 2, steps(10, 40)), 2)).toBe(2);
  });

  it('a sűrű sáv sosem ritkább a sortáv szerintinél', () => {
    const wide = { ...salad, rows: 3, axis_span_cm: 55 };
    for (const w of widths) expect(put(wide, pl(0, w)).rows, `${w} cm`).toBeGreaterThanOrEqual(rowsForSpan(w, 20));
  });

  it('a sortáv szerinti sáv (kerekítési maradékkal, egy sorral is) a sortáv szerinti marad', () => {
    const textbook: PlantingListItem[] = [
      salad,
      { ...salad, axis_span_cm: 55 },
      { ...salad, rows: 1, axis_span_cm: 10 },
      tomato,
      { ...tomato, axis_span_cm: 10 },
    ];
    for (const p of textbook) {
      for (const w of widths) expect(put(p, pl(0, w)).rows, `${p.rows} sor ${p.axis_span_cm} cm-en → ${w} cm`).toBe(rowsForSpan(w, p.row_spacing_cm));
    }
  });

  it('köztes szélességen mentve, majd újra betöltve a sortáv szerinti sáv a sortávot követi', () => {
    // 2 sor 40 cm-en → 55 cm (még 2 sor), mentés („Részletek”), és a piszkozat újra a mentett állapotból
    const saved = drag(draftFrom([salad], bed), 2, steps(40, 55)).items[0]!;
    expect(saved).toMatchObject({ axis_span_cm: 55, rows: 2 });
    const d = draftFrom([saved], bed);
    expect(rowsOf(drag(d, 2, steps(55, 40)), 2)).toBe(2);
    expect(rowsOf(drag(d, 2, steps(55, 80)), 2)).toBe(4);
  });

  it('köztes szélességen mentve, majd újra betöltve a sűrű sáv megtartja a sűrűséget', () => {
    // 3 sor 40 cm-en → 55 cm: 4 sor; mentés, és a piszkozat újra a mentett állapotból (4 sor 55 cm-en)
    const saved = drag(draftFrom([dense], bed), 2, steps(40, 55)).items[0]!;
    expect(saved).toMatchObject({ axis_span_cm: 55, rows: 4 });
    const d = draftFrom([saved], bed);
    // 40 cm-en 2,91 sor fér el a mentett sorközzel: a legközelebbi egész 3, nem 2
    expect(rowsOf(drag(d, 2, steps(55, 40)), 2)).toBe(3);
    expect(rowsOf(drag(d, 2, steps(55, 80)), 2)).toBe(6);
    // visszahúzva a mentett szélességre a mentett sorszám áll vissza
    const back = drag(d, 2, [...steps(55, 40), ...steps(40, 55)]);
    expect(rowsOf(back, 2)).toBe(4);
    expect(isDirty([saved], back)).toBe(false);
  });

  it('a keskenyre húzott egysoros sáv másolata a sortávot követi', () => {
    // paradicsom (35 cm-es sortáv) 10 cm-re szűkítve: 1 sor, ami a sortáv szerint is annyi
    let d = drag(draftFrom([tomato], bed), 1, steps(30, 10));
    expect(d.items[0]).toMatchObject({ axis_span_cm: 10, rows: 1 });
    const copy = copyPlanting(d.items[0]!, d.nextId);
    d = addItem(d, copy);
    expect(rowsOf(drag(d, copy.id, steps(10, 60)), copy.id)).toBe(1);
    expect(rowsOf(drag(d, copy.id, steps(10, 80)), copy.id)).toBe(2);
  });

  it('a sűrű sáv másolata megtartja a sűrűséget', () => {
    let d = draftFrom([dense], bed);
    // „Még egy sáv ebből”: a másolat a forrás szélességével és sorszámával kerül be
    const copy = copyPlanting(dense, d.nextId);
    d = addItem(d, copy);
    expect(applyStrips(d, [{ key: copy.id, placement: pl(40, 30) }], bed).items[1]!.rows).toBe(2);
    expect(applyStrips(d, [{ key: copy.id, placement: pl(0, 80) }], bed).items[1]!.rows).toBe(6);
    expect(applyStrips(d, [{ key: copy.id, placement: pl(40, 40) }], bed).items[1]!.rows).toBe(3);
    // a sortáv szerint 1, illetve 4 sor lenne
    expect(rowsForSpan(30, 20)).toBe(1);
    expect(rowsForSpan(80, 20)).toBe(4);
  });

  it('a kettéosztott sáv mindkét fele megtartja a sűrűséget', () => {
    let d = draftFrom([dense], bed);
    // a kettéosztás a sor hosszát felezi (keresztirányban), a szélesség marad
    const next = splitStrip(stripsAt(d, bed, 2027, '2027-04-12'), dense.id, d.nextId)!;
    d = applyStrips(addItem(d, copyPlanting(dense, d.nextId)), next, bed);
    expect(d.items.map((p) => [p.id, p.axis_span_cm, p.cross_start_cm, p.cross_span_cm, p.rows])).toEqual([
      [2, 40, 0, 100, 3],
      [-1, 40, 100, 100, 3],
    ]);
    // az egyik fele szélesítve a saját sorközét követi: a sortáv szerint 3, illetve 4 sor lenne
    const widen = (to: number) =>
      steps(40, to).reduce((acc, w) => applyStrips(acc, [{ key: -1, placement: pl(0, w, 100, 100) }], bed), d);
    expect(rowsOf(widen(60), -1)).toBe(5);
    expect(rowsOf(widen(80), -1)).toBe(6);
    expect(rowsOf(widen(80), 2)).toBe(3);
  });

  it('a növény cseréje új alapot ad: a szélesítés az új növény sorközét követi', () => {
    let d = draftFrom([tomato, dense], bed);
    // a saláta helyén friss paradicsom ugyanazzal az azonosítóval, egy sorral, a saját sortávjával
    const fresh = item(2, { plant_id: 7, plant_name: 'Paradicsom', method: 'palanta', row_spacing_cm: 35, rows: 1, axis_span_cm: 35 });
    d = applyStrips(replaceItem(d, fresh), [{ key: 2, placement: pl(0, 40) }], bed);
    expect(d.items[0]).toBe(tomato);
    expect(d.items[1]).toMatchObject({ plant_id: 7, axis_span_cm: 40, rows: 1 });
    // a saláta 40/3 cm-es sorközével 4, illetve 5 sor lenne
    expect(rowsOf(drag(d, 2, [45, 50, 55, 60]), 2)).toBe(1);
    expect(rowsOf(drag(d, 2, steps(40, 70)), 2)).toBe(2);
  });

  it('a piszkozatban nem szereplő ültetés cseréje nem változtat', () => {
    const d = draftFrom([tomato], bed);
    expect(replaceItem(d, { ...salad, id: 99 })).toBe(d);
  });

  it('új sáv beillesztésekor csak az új sáv kap helyet', () => {
    const d = draftFrom([tomato, salad], bed);
    const fresh = { ...copyPlanting(salad, d.nextId), axis_start_cm: null, axis_span_cm: 20, rows: 1 };
    const out = applyStrips(addItem(d, fresh), [{ key: fresh.id, placement: pl(40, 40) }], bed);
    expect(out.items[0]).toBe(tomato);
    expect(out.items[1]).toBe(salad);
    expect(out.items[2]).toMatchObject({ id: -1, axis_start_cm: 40, axis_span_cm: 40, rows: 2 });
  });

  it('a rögzített és a változatlan sávot érintetlenül hagyja', () => {
    const out = applyStrips(
      draft([tomato, garlic]),
      [{ key: 1, placement: pl(0, 30) }, { key: 3, fixed: true, placement: pl(0, 40) }],
      bed,
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
    const place = (p: PlantingListItem, placement: Placement, b: Bed) =>
      applyStrips(draft([p]), [{ key: p.id, placement }], b).items[0]!;
    const partial = { ...radish, cross_start_cm: 0, cross_span_cm: 40 };
    expect(place(partial, pl(100, 30, 0, 80), across)).toMatchObject({ cross_start_cm: null, cross_span_cm: null });
    expect(place(radish, pl(100, 30, 0, 40), across)).toMatchObject({ cross_start_cm: 0, cross_span_cm: 40 });
    // hosszában futó soroknál ugyanez a 80 cm részleges
    expect(place(radish, pl(0, 30, 0, 80), bed)).toMatchObject({ cross_start_cm: 0, cross_span_cm: 80 });
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
    expect(d).toMatchObject({ items: [tomato, salad], deleted: [], nextId: -1 });
    d = addItem(d, copyPlanting(salad, d.nextId));
    d = addItem(d, copyPlanting(tomato, d.nextId));
    expect(d.items.map((p) => p.id)).toEqual([1, 2, -1, -2]);
    expect(d.nextId).toBe(-3);
    expect(toBatch([tomato, salad], d).create).toHaveLength(2);
    // tetszőleges negatív azonosítóval felvéve is a még ki nem osztottal folytatja
    d = addItem(d, copyPlanting(salad, -7));
    expect(d.nextId).toBe(-8);
    d = addItem(d, copyPlanting(salad, d.nextId));
    expect(new Set(d.items.map((p) => p.id)).size).toBe(d.items.length);
  });

  it('a sorszám alapja a piszkozatba kerüléskori szélesség és sorszám', () => {
    const noRows = { ...salad, id: 5, rows: null };
    const unplaced = { ...salad, id: 6, axis_start_cm: null, axis_span_cm: null };
    expect(draftFrom([tomato, salad, noRows, unplaced], bed).rowBase).toEqual({
      1: { span: 30, rows: 1 },
      2: { span: 40, rows: 2 },
      5: { span: 40, rows: null },
    });
  });

  it('felvételkor a saját szélessége és sorszáma lesz az alap, törléskor az alap is megszűnik', () => {
    let d = addItem(draftFrom([tomato], bed), copyPlanting({ ...salad, rows: 3 }, -1));
    expect(d.rowBase[-1]).toEqual({ span: 40, rows: 3 });
    d = removeItem(d, -1);
    expect(d.rowBase[-1]).toBeUndefined();
    expect(removeItem(d, 1).rowBase).toEqual({});
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
