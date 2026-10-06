import { describe, expect, it } from 'vitest';
import type { CropTiming } from './dates.ts';
import { blankPlanting } from './plantings.ts';
import type { GrowingWindow, PlantingListItem } from '../types.ts';
import {
  boundaries,
  clashFixes,
  layoutRows,
  layoutValid,
  linkedPlantings,
  makeRoom,
  moveRow,
  moveStrip,
  phaseDays,
  pickWindowForDay,
  placeInFree,
  resizeRow,
  resizeStrip,
  rowsReorderable,
  splitStrip,
  type LayoutStrip,
} from './layout.ts';

// 200 × 80 cm-es ágyás, hosszában futó sorokkal: a tengely a 80 cm-es szélesség
const size = { axis: 80, cross: 200 };
const strip = (key: number, axis: number, span: number, cross = 0, crossSpan = 200, fixed = false): LayoutStrip => ({
  key,
  fixed,
  placement: { axis_start_cm: axis, axis_span_cm: span, cross_start_cm: cross, cross_span_cm: crossSpan },
});
const at = (strips: LayoutStrip[] | null, key: number) => {
  expect(strips).not.toBeNull();
  const found = strips!.find((s) => s.key === key);
  expect(found, `a(z) ${key} kulcsú sáv hiányzik`).toBeDefined();
  return found!.placement;
};
// paradicsom 0–30, bazsalikom 30–50, paradicsom 50–80
const three = () => [strip(1, 0, 30), strip(2, 30, 20), strip(3, 50, 30)];

describe('méretezés', () => {
  it('a húzott él a rácsra ugrik, és az érintkező szomszéd enged', () => {
    const out = resizeStrip(three(), 2, ['axisEnd'], { axis: 12, cross: 0 }, size);
    expect(at(out, 2)).toMatchObject({ axis_start_cm: 30, axis_span_cm: 30 });
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 60, axis_span_cm: 20 });
  });

  it('visszafelé húzva a szomszéd követi', () => {
    const out = resizeStrip(three(), 2, ['axisEnd'], { axis: -7, cross: 0 }, size);
    expect(at(out, 2).axis_span_cm).toBe(15);
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 45, axis_span_cm: 35 });
  });

  it('a szomszéd legfeljebb 10 cm-ig keskenyedik', () => {
    const out = resizeStrip(three(), 2, ['axisEnd'], { axis: 40, cross: 0 }, size);
    expect(at(out, 2).axis_span_cm).toBe(40);
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 70, axis_span_cm: 10 });
  });

  it('rögzített szomszéd nem enged', () => {
    const strips = [strip(1, 0, 30), strip(2, 30, 20), strip(3, 50, 30, 0, 200, true)];
    const out = resizeStrip(strips, 2, ['axisEnd'], { axis: 10, cross: 0 }, size);
    expect(at(out, 2).axis_span_cm).toBe(20);
    expect(at(out, 3).axis_start_cm).toBe(50);
  });

  it('rögzített sáv nem méretezhető', () => {
    expect(resizeStrip([strip(1, 0, 30, 0, 200, true)], 1, ['axisEnd'], { axis: 10, cross: 0 }, size)).toBeNull();
  });

  it('a sarok mindkét irányt állítja', () => {
    const out = resizeStrip([strip(1, 0, 30, 0, 100)], 1, ['axisEnd', 'crossEnd'], { axis: 10, cross: 50 }, size);
    expect(at(out, 1)).toEqual({ axis_start_cm: 0, axis_span_cm: 40, cross_start_cm: 0, cross_span_cm: 150 });
  });

  it('a részben érintkező szomszédok is engednek', () => {
    const strips = [strip(1, 0, 30), strip(2, 30, 20, 0, 100), strip(3, 30, 20, 100, 100)];
    const out = resizeStrip(strips, 1, ['axisEnd'], { axis: 10, cross: 0 }, size);
    expect(at(out, 1).axis_span_cm).toBe(40);
    expect(at(out, 2)).toMatchObject({ axis_start_cm: 40, axis_span_cm: 10 });
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 40, axis_span_cm: 10 });
  });

  it('zsugorításkor a nála szélesebb érintkező szomszéd nem követi', () => {
    const strips = [strip(1, 0, 30), strip(2, 30, 20, 0, 100), strip(4, 30, 20, 100, 100), strip(3, 50, 30)];
    const out = resizeStrip(strips, 2, ['axisEnd'], { axis: -10, cross: 0 }, size);
    expect(at(out, 2)).toMatchObject({ axis_start_cm: 30, axis_span_cm: 10 });
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 50, axis_span_cm: 30 });
    expect(at(out, 4)).toMatchObject({ axis_start_cm: 30, axis_span_cm: 20 });
  });

  it('a sarok második éle az első él utáni állapotból számol', () => {
    const strips = [strip(1, 0, 30, 0, 100), strip(2, 35, 15, 120, 80)];
    const out = resizeStrip(strips, 1, ['axisEnd', 'crossEnd'], { axis: 10, cross: 50 }, size);
    expect(at(out, 1)).toEqual({ axis_start_cm: 0, axis_span_cm: 40, cross_start_cm: 0, cross_span_cm: 120 });
  });

  it('a 10 cm-nél keskenyebb régi szomszédot nem húzza vissza, hanem megáll', () => {
    const out = resizeStrip([strip(1, 0, 30), strip(2, 30, 8)], 1, ['axisEnd'], { axis: 5, cross: 0 }, size);
    expect(at(out, 1)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 30 });
    expect(at(out, 2)).toMatchObject({ axis_start_cm: 30, axis_span_cm: 8 });
  });
});

describe('layoutValid', () => {
  it('a változatlanul hagyott régi átfedést eltűri', () => {
    const before = [strip(1, 0, 30), strip(2, 20, 30)];
    expect(layoutValid(before, before, size)).toBe(true);
  });

  it('az új átfedést elutasítja', () => {
    const before = [strip(1, 0, 30), strip(2, 30, 20)];
    const after = [strip(1, 0, 40), strip(2, 30, 20)];
    expect(layoutValid(before, after, size)).toBe(false);
  });
});

describe('mozgatás', () => {
  it('a szomszéd közepén túlra húzva helyet cserélnek', () => {
    const out = moveStrip(three(), 2, { axis: -30, cross: 0 }, size);
    expect(at(out, 2)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 20 });
    expect(at(out, 1)).toMatchObject({ axis_start_cm: 20, axis_span_cm: 30 });
    expect(at(out, 3).axis_start_cm).toBe(50);
  });

  it('a közepéig nem cserél, és átfedő helyre nem mozdul', () => {
    const out = moveStrip(three(), 2, { axis: -20, cross: 0 }, size);
    expect(at(out, 2).axis_start_cm).toBe(30);
  });

  it('szabad helyre mozgatható', () => {
    const out = moveStrip([strip(1, 0, 30), strip(2, 40, 20)], 2, { axis: 12, cross: 0 }, size);
    expect(at(out, 2).axis_start_cm).toBe(50);
  });

  it('foglalt hely előtt megáll', () => {
    const out = moveStrip([strip(1, 0, 30), strip(2, 40, 20)], 2, { axis: -15, cross: 0 }, size);
    expect(at(out, 2).axis_start_cm).toBe(30);
  });

  it('előre húzva a közepén túl helyet cserél', () => {
    const out = moveStrip(three(), 2, { axis: 30, cross: 0 }, size);
    expect(at(out, 1)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 30 });
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 30, axis_span_cm: 30 });
    expect(at(out, 2)).toMatchObject({ axis_start_cm: 60, axis_span_cm: 20 });
  });

  it('a 10 cm-nél keskenyebb régi sáv a másik irányban mozgatható', () => {
    const out = moveStrip([strip(1, 0, 8, 0, 100)], 1, { axis: 0, cross: 20 }, size);
    expect(at(out, 1).cross_start_cm).toBe(20);
  });

  it('rögzített sáv nem mozgatható', () => {
    expect(moveStrip([strip(1, 0, 30, 0, 200, true)], 1, { axis: 0, cross: 10 }, size)).toBeNull();
  });
});

describe('szétvágás', () => {
  it('a sor hossza mentén felezi, a második fél az új kulcsot kapja', () => {
    const out = splitStrip([strip(1, 0, 30)], 1, -1);
    expect(at(out, 1)).toMatchObject({ cross_start_cm: 0, cross_span_cm: 100 });
    expect(at(out, -1)).toEqual({ axis_start_cm: 0, axis_span_cm: 30, cross_start_cm: 100, cross_span_cm: 100 });
  });

  it('rögzített sáv nem vágható', () => {
    expect(splitStrip([strip(1, 0, 30, 0, 200, true)], 1, -1)).toBeNull();
  });

  it('20 cm-nél rövidebb sáv nem vágható', () => {
    expect(splitStrip([strip(1, 0, 30, 0, 15)], 1, -1)).toBeNull();
  });
});

describe('sorok', () => {
  const strips = () => [strip(1, 0, 30), strip(2, 30, 20, 0, 100), strip(4, 30, 20, 100, 100), strip(3, 50, 30)];

  it('az azonos tengelyszakaszon állók egy sorba kerülnek', () => {
    expect(layoutRows(strips())).toEqual([
      { start: 0, span: 30, keys: [1] },
      { start: 30, span: 20, keys: [2, 4] },
      { start: 50, span: 30, keys: [3] },
    ]);
  });

  it('egész sor áthelyezhető', () => {
    const s = strips();
    const out = moveRow(s, layoutRows(s), 2, 0);
    expect(at(out, 3).axis_start_cm).toBe(0);
    expect(at(out, 1).axis_start_cm).toBe(30);
    expect(at(out, 2).axis_start_cm).toBe(60);
    expect(at(out, 4).axis_start_cm).toBe(60);
  });

  it('a sorok közötti hézag a helyén marad', () => {
    const s = [strip(1, 0, 30), strip(3, 40, 30)];
    const out = moveRow(s, layoutRows(s), 1, 0);
    expect(at(out, 3).axis_start_cm).toBe(0);
    expect(at(out, 1).axis_start_cm).toBe(40);
  });

  it('részben átfedő sorok nem rendezhetők át', () => {
    const s = [strip(1, 0, 30, 0, 100), strip(2, 20, 30, 100, 100)];
    expect(rowsReorderable(layoutRows(s))).toBe(false);
    expect(moveRow(s, layoutRows(s), 1, 0)).toBeNull();
  });

  it('a léptető a sor végét mozgatja, a szomszéd enged', () => {
    const s = three();
    const out = resizeRow(s, layoutRows(s)[1]!, 5, size);
    expect(at(out, 2).axis_span_cm).toBe(25);
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 55, axis_span_cm: 25 });
  });

  it('az ágyás szélén a sor eleje mozdul', () => {
    const s = three();
    const out = resizeRow(s, layoutRows(s)[2]!, 5, size);
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 45, axis_span_cm: 35 });
    expect(at(out, 2).axis_span_cm).toBe(15);
  });
});

describe('sor léptetése több sávval', () => {
  const rowStrips = () => [
    strip(1, 0, 30),
    strip(2, 30, 20, 0, 100),
    strip(4, 30, 20, 100, 100),
    strip(5, 50, 30, 0, 100, true),
    strip(6, 50, 30, 100, 100),
  ];
  // mindkét tömbsorrend: az akadályos és a szabad szomszédú fél van elöl
  for (const [név, sorrend] of [
    ['akadályos fél elöl', (s: LayoutStrip[]) => s],
    ['szabad szomszédú fél elöl', (s: LayoutStrip[]) => [s[0]!, s[2]!, s[1]!, s[4]!, s[3]!]],
  ] as const) {
    it(`a sor sávjai együtt maradnak: ha a vége megosztaná, az eleje mozdul (${név})`, () => {
      const s = sorrend(rowStrips());
      const row = layoutRows(s).find((r) => r.keys.includes(2))!;
      const out = resizeRow(s, row, 5, size);
      expect(at(out, 2)).toMatchObject({ axis_start_cm: 25, axis_span_cm: 25 });
      expect(at(out, 4)).toMatchObject({ axis_start_cm: 25, axis_span_cm: 25 });
      expect(at(out, 1)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 25 });
    });
  }

  it('a 10 cm-nél keskenyebb régi sor a léptetéstől nem szélesedik', () => {
    const s = [strip(1, 0, 30), strip(2, 30, 8), strip(3, 38, 42)];
    const out = resizeRow(s, layoutRows(s)[1]!, -5, size);
    if (out) expect(at(out, 2).axis_span_cm).toBeLessThanOrEqual(8);
  });
});

describe('határok', () => {
  it('az érintkező sávpárok közös határa', () => {
    expect(boundaries(three())).toEqual([
      { a: 1, b: 2, dim: 'axis', at: 30, from: 0, to: 200 },
      { a: 2, b: 3, dim: 'axis', at: 50, from: 0, to: 200 },
    ]);
  });

  it('a keresztirányú érintkezést is megtalálja', () => {
    expect(boundaries([strip(1, 0, 30, 0, 100), strip(2, 0, 30, 100, 100)])).toEqual([
      { a: 1, b: 2, dim: 'cross', at: 100, from: 0, to: 30 },
    ]);
  });
});

describe('új sáv helye', () => {
  it('az első szabad szakasz, ahová befér', () => {
    expect(placeInFree([[0, 20], [50, 80]], 30, 200)).toEqual({ axis_start_cm: 50, axis_span_cm: 30, cross_start_cm: 0, cross_span_cm: 200 });
  });

  it('ha sehová nem fér be, a legnagyobb szabad szakasz (kitöltve)', () => {
    expect(placeInFree([[0, 20], [60, 72]], 30, 200)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 20 });
    expect(placeInFree([[0, 5]], 30, 200)).toBeNull();
  });

  it('hely híján a cél sáv enged az új sávnak', () => {
    const room = makeRoom(three(), 3, 30);
    expect(at(room!.strips, 3)).toMatchObject({ axis_start_cm: 50, axis_span_cm: 10 });
    expect(room!.placement).toEqual({ axis_start_cm: 60, axis_span_cm: 20, cross_start_cm: 0, cross_span_cm: 200 });
    expect(makeRoom([strip(1, 0, 15)], 1, 30)).toBeNull();
  });
});

describe('időpontok és vetési ablak', () => {
  const frost = { lastFrost: '05-10', firstFrost: '10-20' };
  const win = (id: number, method: GrowingWindow['method'], w: Partial<GrowingWindow>): GrowingWindow => ({
    id, plant_id: 1, variety_id: null, season: 'tavaszi', method, sow_start: null, sow_end: null, seedling_weeks: null,
    transplant_start: null, transplant_end: null, harvest_start: null, harvest_end: null, harvest_year_offset: 0,
    succession_days: null, notes: null, ...w,
  });
  const lettuce: CropTiming = { daysToHarvest: 50, harvestDurationDays: 20, frostSensitive: false, perennial: false };
  // ágyásban: 1. márc. 20.–máj. 29.; 2. márc. 15.–máj. 24.; 3. máj. 1.–júl. 10.; 4. aug. 15.–okt. 24.
  const windows = [
    win(1, 'palanta', { sow_start: '02-01', seedling_weeks: 6, transplant_start: '03-20' }),
    win(2, 'helyrevetes', { sow_start: '03-15' }),
    win(3, 'helyrevetes', { season: 'nyari', sow_start: '05-01' }),
    win(4, 'helyrevetes', { season: 'oszi', sow_start: '08-15' }),
  ];
  const pick = (day: string) => pickWindowForDay(windows, day, { year: 2027, crop: lettuce, frost });

  it('az elő-, fő- és utóvetemény napja a fagyhatárokból', () => {
    expect(phaseDays(2027, frost)).toEqual({ elo: '2027-04-12', fo: '2027-07-01', uto: '2027-09-22' });
  });

  it('azt az ablakot választja, amelyikben a növény a napon az ágyásban áll (a legkésőbb kezdődőt)', () => {
    expect(pick('2027-04-12')).toMatchObject({ window: { id: 1 }, method: 'palanta', dates: { transplant: '2027-03-20' } });
    // máj. 26-án az 1. és a 3. is ott áll: a később kezdődő
    expect(pick('2027-05-26')!.window.id).toBe(3);
  });

  it('ha egyik sem áll ott, a nap utáni legközelebbit, végül a nap előttit', () => {
    expect(pick('2027-07-20')!.window.id).toBe(4);
    expect(pick('2027-12-01')!.window.id).toBe(4);
    expect(pickWindowForDay([], '2027-04-12', { year: 2027, crop: lettuce, frost })).toBeNull();
  });
});

const planting = (id: number, o: Partial<PlantingListItem> = {}): PlantingListItem => ({
  ...blankPlanting(),
  id, year: 2027, plant_id: 7, plant_name: 'Paradicsom', bed_id: 1, method: 'palanta',
  plan_sow_date: '2027-03-15', plan_transplant_date: '2027-05-10', plan_harvest_start: '2027-07-14', plan_end_date: '2027-10-12',
  ...o,
});

describe('kapcsolt ültetések', () => {
  it('ugyanabban az ágyásban, azonos növény, módszer és tervezett dátumok', () => {
    const all = [
      planting(1),
      planting(2),
      planting(3, { plan_end_date: '2027-10-01' }),
      planting(4, { bed_id: 2 }),
      planting(5, { is_history: true }),
      planting(6, { actual_bed_id: 2 }),
      planting(7, { variety_id: 3 }),
    ];
    expect(linkedPlantings(all[0]!, all).map((p) => p.id)).toEqual([2]);
  });

  it('dátum nélküli ültetésnek nincs kapcsolt párja', () => {
    const blank = { plan_sow_date: null, plan_transplant_date: null, plan_harvest_start: null, plan_end_date: null };
    expect(linkedPlantings(planting(1, blank), [planting(1, blank), planting(2, blank)])).toEqual([]);
  });
});

describe('ütközésjavítás', () => {
  const salad = (o: Partial<PlantingListItem> = {}) =>
    planting(10, {
      plant_id: 8, plant_name: 'Saláta', method: 'helyrevetes',
      plan_sow_date: '2027-03-20', plan_transplant_date: null, plan_harvest_start: '2027-05-09', plan_end_date: '2027-06-05',
      ...o,
    });

  it('az előző korábban szabadítja fel a helyet, vagy az új később jön', () => {
    expect(clashFixes(planting(1), salad())).toEqual([
      { kind: 'elozo_vege', plantingId: 10, date: '2027-05-10' },
      { kind: 'kesobbi_eltolas', plantingId: 1, days: 26, date: '2027-06-05' },
    ]);
  });

  it('a betakarítás kezdete elé nem hozza a véget', () => {
    expect(clashFixes(planting(1), salad({ plan_harvest_start: '2027-05-20' })).map((f) => f.kind)).toEqual(['kesobbi_eltolas']);
  });

  it('már az ágyásba került ültetést nem told el', () => {
    expect(clashFixes(planting(1, { actual_transplant_date: '2027-05-10' }), salad()).map((f) => f.kind)).toEqual(['elozo_vege']);
  });
});
