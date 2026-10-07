import { describe, expect, it } from 'vitest';
import type { CropTiming } from './dates.ts';
import { blankPlanting, occupancyPeriod } from './plantings.ts';
import { periodsOverlap } from './geometry.ts';
import type { GrowingWindow, PlantingListItem } from '../types.ts';
import {
  applyClashFix,
  boundaries,
  clashFixes,
  isFullLength,
  layoutRows,
  layoutValid,
  linkedPlantings,
  makeRoom,
  makeRoomEvenly,
  moveRow,
  moveStrip,
  phaseDays,
  pickWindowForDay,
  placeInFree,
  resizeRow,
  resizeStrip,
  rowsReorderable,
  splitStrip,
  type ClashFix,
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

  it('üres szabadlistára null', () => {
    expect(placeInFree([], 30, 200)).toBeNull();
  });

  it('a rácsra igazítás után 10 cm-nél rövidebb szakaszok nem számítanak', () => {
    // 3–12 → 5–10 (5 cm), 22–33 → 25–30 (5 cm)
    expect(placeInFree([[3, 12], [22, 33]], 30, 200)).toBeNull();
  });

  it('a rácson kívüli szakasz eleje felfelé, vége lefelé igazodik', () => {
    expect(placeInFree([[33, 72]], 30, 200)).toEqual({ axis_start_cm: 35, axis_span_cm: 30, cross_start_cm: 0, cross_span_cm: 200 });
    expect(placeInFree([[33, 72]], 50, 200)).toMatchObject({ axis_start_cm: 35, axis_span_cm: 35 });
  });

  it('a rögzített vagy hiányzó cél sávtól nem vesz helyet', () => {
    expect(makeRoom([strip(1, 0, 40, 0, 200, true)], 1, 20)).toBeNull();
    expect(makeRoom(three(), 99, 20)).toBeNull();
  });

  it('a részben hosszú cél sáv megtartja a keresztirányú szakaszát', () => {
    const room = makeRoom([strip(1, 0, 40, 20, 100)], 1, 20);
    expect(room!.placement).toEqual({ axis_start_cm: 20, axis_span_cm: 20, cross_start_cm: 20, cross_span_cm: 100 });
    expect(at(room!.strips, 1)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 20, cross_start_cm: 20, cross_span_cm: 100 });
  });

  it('hely híján a cél sáv enged az új sávnak', () => {
    const room = makeRoom(three(), 3, 30);
    expect(at(room!.strips, 3)).toMatchObject({ axis_start_cm: 50, axis_span_cm: 10 });
    expect(room!.placement).toEqual({ axis_start_cm: 60, axis_span_cm: 20, cross_start_cm: 0, cross_span_cm: 200 });
    expect(makeRoom([strip(1, 0, 15)], 1, 30)).toBeNull();
  });

  it('a 20 cm-nél keskenyebb cél sáv nem enged (mindkét sáv legalább 10 cm maradna)', () => {
    for (const span of [5, 10, 15]) expect(makeRoom([strip(1, 0, span)], 1, 10), `${span} cm`).toBeNull();
    expect(makeRoom([strip(1, 0, 20)], 1, 10)!.placement).toMatchObject({ axis_start_cm: 10, axis_span_cm: 10 });
  });

  it('a rácson kívül végződő cél sávnál a közös határ a rácsra kerül', () => {
    // 0–47 cm, 30 cm kérés: a határ 17 helyett 15
    const room = makeRoom([strip(1, 0, 47)], 1, 30);
    expect(at(room!.strips, 1)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 15 });
    expect(room!.placement).toMatchObject({ axis_start_cm: 15, axis_span_cm: 32 });
  });

  it('a rácson kívüli kezdetű cél sáv legalább 10 cm-t megtart, a határ akkor is a rácson van', () => {
    // 3–50 cm, 40 cm kérés: a 10-es határ 7 cm-t hagyna, ezért 15
    const room = makeRoom([strip(1, 3, 47)], 1, 40);
    expect(at(room!.strips, 1)).toMatchObject({ axis_start_cm: 3, axis_span_cm: 12 });
    expect(room!.placement).toMatchObject({ axis_start_cm: 15, axis_span_cm: 35 });
  });

  it('a kért szélesség a rácsra kerekedik, és az új sáv legalább 10 cm', () => {
    expect(makeRoom([strip(1, 0, 80)], 1, 33)!.placement).toMatchObject({ axis_start_cm: 45, axis_span_cm: 35 });
    expect(makeRoom([strip(1, 0, 80)], 1, 4)!.placement).toMatchObject({ axis_start_cm: 70, axis_span_cm: 10 });
    // 0–48 cm, 10 cm kérés: a 38-as határ 40-re kerekedne (8 cm), ezért 35
    expect(makeRoom([strip(1, 0, 48)], 1, 10)!.placement).toMatchObject({ axis_start_cm: 35, axis_span_cm: 13 });
  });
});

describe('egyenletes engedés új sávnak', () => {
  it('paradicsom és bazsalikom mellé a másolat a végére: minden sor arányosan enged', () => {
    const room = makeRoomEvenly([strip(1, 0, 50), strip(2, 50, 30)], size, 50, 2);
    expect(at(room!.strips, 1)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 30 });
    expect(at(room!.strips, 2)).toMatchObject({ axis_start_cm: 30, axis_span_cm: 20 });
    expect(room!.placement).toMatchObject({ axis_start_cm: 50, axis_span_cm: 30, cross_start_cm: 0, cross_span_cm: 200 });
  });

  it('az új sor a megadott helyre kerül, a hézag elfogy', () => {
    const room = makeRoomEvenly([strip(1, 0, 40), strip(2, 50, 30)], size, 20, 1);
    expect(at(room!.strips, 1)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 35 });
    expect(room!.placement).toMatchObject({ axis_start_cm: 35, axis_span_cm: 20 });
    expect(at(room!.strips, 2)).toMatchObject({ axis_start_cm: 55, axis_span_cm: 25 });
  });

  it('a sor hosszában osztott sávjai együtt mozognak', () => {
    const room = makeRoomEvenly([strip(1, 0, 50, 0, 100), strip(2, 0, 50, 100, 100), strip(3, 50, 30)], size, 50, 0);
    expect(room!.placement).toMatchObject({ axis_start_cm: 0, axis_span_cm: 30 });
    expect(at(room!.strips, 1)).toMatchObject({ axis_start_cm: 30, axis_span_cm: 30, cross_start_cm: 0, cross_span_cm: 100 });
    expect(at(room!.strips, 2)).toMatchObject({ axis_start_cm: 30, axis_span_cm: 30, cross_start_cm: 100, cross_span_cm: 100 });
    expect(at(room!.strips, 3)).toMatchObject({ axis_start_cm: 60, axis_span_cm: 20 });
  });

  it('rögzített sáv mellett vagy a minimumon sem férő új sornál nincs egyenletes engedés', () => {
    expect(makeRoomEvenly([strip(1, 0, 50, 0, 200, true), strip(2, 50, 30)], size, 30, 2)).toBeNull();
    const full = [10, 20, 30, 40, 50, 60, 70].map((a, i) => strip(i + 1, a, 10)).concat(strip(8, 0, 10));
    expect(makeRoomEvenly(full, size, 30, 8)).toBeNull();
  });
});

describe('teljes hosszú sáv', () => {
  it('a keresztirányban az ágyás egész hosszán fut (fél cm tűréssel)', () => {
    const pl = (cross: number, crossSpan: number) => strip(1, 0, 30, cross, crossSpan).placement;
    expect(isFullLength(pl(0, 200), 200)).toBe(true);
    expect(isFullLength(pl(0.2, 199.9), 200)).toBe(true);
    expect(isFullLength(pl(0, 100), 200)).toBe(false);
    expect(isFullLength(pl(100, 100), 200)).toBe(false);
    expect(isFullLength(pl(0, 80), 80)).toBe(true);
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

  it('a sikertelen, lezárt és lezárt végű ültetés nem kapcsolt, a folyamatban lévő igen', () => {
    const all = [
      planting(1),
      planting(2, { status: 'folyamatban' }),
      planting(3, { status: 'sikertelen' }),
      planting(4, { status: 'lezart' }),
      planting(5, { actual_end_date: '2027-09-01' }),
    ];
    expect(linkedPlantings(all[0]!, all).map((p) => p.id)).toEqual([2]);
  });

  it('más év vagy más módszer nem kapcsolt', () => {
    const all = [planting(1), planting(2, { year: 2028 }), planting(3, { method: 'helyrevetes' })];
    expect(linkedPlantings(all[0]!, all)).toEqual([]);
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

  it('évelőnél nem hozza előre a véget: az a felszámolását jelentené (nem kerülne át a következő évre)', () => {
    expect(clashFixes(planting(1), salad({ perennial: true })).map((f) => f.kind)).toEqual(['kesobbi_eltolas']);
  });

  it('egymást nem fedő ültetésekre nincs javítás', () => {
    // a saláta jún. 5-én kikerül, a paradicsom csak jún. 10-én jön: a saláta vége nem tolódhat később
    const tomato = planting(1, { plan_transplant_date: '2027-06-10' });
    expect(clashFixes(salad(), tomato)).toEqual([]);
    expect(clashFixes(tomato, salad())).toEqual([]);
  });
});

describe('ütközésjavítás: ellenőrzött javítások', () => {
  const base = (id: number, o: Partial<PlantingListItem>) => planting(id, o);
  // rövid tenyészidejű saláta: márc. 20.–jún. 5.
  const saladDates: Partial<PlantingListItem> = {
    method: 'helyrevetes', plan_sow_date: '2027-03-20', plan_transplant_date: null, plan_harvest_start: '2027-05-09', plan_end_date: '2027-06-05',
  };
  const pairs: [string, PlantingListItem, PlantingListItem, ClashFix['kind'][]][] = [
    ['palánta után saláta', base(1, {}), base(10, saladDates), ['elozo_vege', 'kesobbi_eltolas']],
    ['két palánta egymás után', base(1, { plan_end_date: '2027-08-01' }), base(2, { plan_transplant_date: '2027-06-01', plan_sow_date: '2027-04-10', plan_harvest_start: '2027-08-20', plan_end_date: '2027-10-01' }), ['kesobbi_eltolas']],
    ['azonos kezdőnap', base(3, saladDates), base(-1, saladDates), ['kesobbi_eltolas']],
    ['már az ágyásban álló és új', base(4, { ...saladDates, actual_sow_date: '2027-03-20' }), base(-2, saladDates), ['kesobbi_eltolas']],
    ['betakarítás előtti vég', base(1, { plan_harvest_start: '2027-07-01', plan_end_date: '2027-08-20' }), base(5, { plan_transplant_date: '2027-06-15', plan_sow_date: '2027-05-01', plan_harvest_start: '2027-08-15', plan_end_date: '2027-10-15' }), ['kesobbi_eltolas']],
    ['megkezdett betakarítás', base(1, { actual_harvest_start: '2027-06-01' }), base(6, { plan_transplant_date: '2027-06-20', plan_sow_date: '2027-05-01', plan_harvest_start: '2027-08-15', plan_end_date: '2027-10-15' }), ['elozo_vege']],
  ];

  for (const [név, x, y, kinds] of pairs) {
    it(`minden felkínált javítás tényleg megszünteti az átfedést (${név})`, () => {
      expect(periodsOverlap(occupancyPeriod(x)!, occupancyPeriod(y)!)).toBe(true);
      const fixes = clashFixes(x, y);
      expect(fixes.map((f) => f.kind)).toEqual(kinds);
      for (const fix of fixes) {
        const target = fix.plantingId === x.id ? x : y;
        const other = fix.plantingId === x.id ? y : x;
        const period = occupancyPeriod(applyClashFix(target, fix));
        expect(period).not.toBeNull();
        expect(periodsOverlap(period!, occupancyPeriod(other)!), JSON.stringify(fix)).toBe(false);
      }
    });
  }

  it('átvitt későbbi ültetésre nincs eltolás (a kezdete nem a tervezett dátumból jön)', () => {
    // ősszel vetett, a következő év júniusában felszabaduló korábbi ültetés
    const a = planting(1, {
      year: 2026, method: 'helyrevetes', plan_sow_date: '2026-10-15', plan_transplant_date: null,
      plan_harvest_start: '2027-06-01', plan_end_date: '2027-06-20',
    });
    // az átvitt évelő január 1-jétől áll a helyén, tehát ez a későbbi
    const carried = planting(2, {
      carried_from_id: 99, method: 'palanta', plan_sow_date: null, plan_transplant_date: null,
      plan_harvest_start: '2027-07-01', plan_end_date: '2027-07-10',
    });
    expect(occupancyPeriod(carried)!.start > occupancyPeriod(a)!.start).toBe(true);
    for (const fixes of [clashFixes(a, carried), clashFixes(carried, a)]) {
      expect(fixes.map((f) => f.kind)).not.toContain('kesobbi_eltolas');
    }
    // ugyanez tervezett kiültetéssel eltolható
    const planned = { ...carried, carried_from_id: null, plan_sow_date: '2027-03-15', plan_transplant_date: '2027-05-01' };
    expect(clashFixes(a, planned)).toEqual([{ kind: 'kesobbi_eltolas', plantingId: 2, days: 50, date: '2027-06-20' }]);
  });

  it('a vég nélküli, de ismert betakarítású korábbi ültetés becsült vége után eltolható', () => {
    // betakarítás júl. 14., vég nélkül: egy hónappal később, aug. 13-án szabadul fel
    const a = planting(1, { plan_end_date: null });
    const next = planting(2, { plan_transplant_date: '2027-06-01' });
    const fixes = clashFixes(a, next);
    expect(fixes).toEqual([{ kind: 'kesobbi_eltolas', plantingId: 2, days: 73, date: '2027-08-13' }]);
    expect(periodsOverlap(occupancyPeriod(applyClashFix(next, fixes[0]!))!, occupancyPeriod(a)!)).toBe(false);
  });

  it('évelő vagy betakarítás nélküli korábbi ültetés az év végéig foglal: utána nincs eltolás', () => {
    // áttelelő utóvetemény: aug. 1-jétől a következő év májusáig
    const next = planting(2, {
      method: 'helyrevetes', plan_sow_date: '2027-08-01', plan_transplant_date: null,
      plan_harvest_start: '2028-04-15', plan_end_date: '2028-05-15',
    });
    // ismert betakarítással a becsült vég (aug. 13.) után eltolható
    expect(clashFixes(planting(1, { plan_end_date: null }), next)).toContainEqual({
      kind: 'kesobbi_eltolas', plantingId: 2, days: 12, date: '2027-08-13',
    });
    // évelőként vagy betakarítás nélkül az év végéig áll: az eltolt kezdet az év utolsó napjára esne
    for (const a of [planting(1, { plan_end_date: null, perennial: true }), planting(1, { plan_end_date: null, plan_harvest_start: null })]) {
      expect(occupancyPeriod(a)!.end).toBe('2027-12-31');
      expect(clashFixes(a, next).map((f) => f.kind)).not.toContain('kesobbi_eltolas');
    }
  });

  it('a betakarítás évében végző ültetést nem tolja át a következő évre', () => {
    // két paradicsom máj. 10.–okt. 12.: az eltolt a következő év márciusáig állna
    for (const fixes of [clashFixes(planting(5), planting(-1)), clashFixes(planting(-1), planting(5))]) {
      expect(fixes).toEqual([]);
    }
  });

  it('az eltolt vég a záró napig számít: január 1-jei vég még az évben marad', () => {
    const a = planting(1, { plan_end_date: '2027-08-01' });
    const next = (end: string) =>
      planting(2, { plan_sow_date: '2027-04-10', plan_transplant_date: '2027-06-01', plan_harvest_start: '2027-08-20', plan_end_date: end });
    // 61 nap eltolás: nov. 1. → jan. 1. (az utolsó foglalt nap dec. 31.), nov. 2. → jan. 2.
    expect(clashFixes(a, next('2027-11-01'))).toEqual([{ kind: 'kesobbi_eltolas', plantingId: 2, days: 61, date: '2027-08-01' }]);
    expect(clashFixes(a, next('2027-11-02'))).toEqual([]);
  });

  it('módszer nélkül a valódi időszakkal számol (a kiültetés napjától)', () => {
    // módszer nélkül az ágyásba kerülés a kiültetés (szept. 1.), nem a vetés (aug. 1.)
    const next = planting(2, {
      method: null, plan_sow_date: '2027-08-01', plan_transplant_date: '2027-09-01',
      plan_harvest_start: '2028-04-15', plan_end_date: '2028-05-15',
    });
    expect(clashFixes(planting(1, { plan_end_date: '2027-11-30' }), next)).toContainEqual({
      kind: 'kesobbi_eltolas', plantingId: 2, days: 90, date: '2027-11-30',
    });
    // dec. 31-ig álló előző után a valódi kezdet dec. 31-re esne (a vetés szerint még nov. 30. lenne)
    expect(clashFixes(planting(1, { plan_end_date: '2027-12-31' }), next).map((f) => f.kind)).not.toContain('kesobbi_eltolas');
  });

  it('módszer nélkül csak kiültetési dátummal is eltolható (ettől a naptól áll az ágyásban)', () => {
    const next = planting(2, {
      method: null, plan_sow_date: null, plan_transplant_date: '2027-06-01', plan_harvest_start: '2027-08-20', plan_end_date: '2027-10-01',
    });
    expect(clashFixes(planting(1, { plan_end_date: '2027-08-01' }), next)).toEqual([
      { kind: 'kesobbi_eltolas', plantingId: 2, days: 61, date: '2027-08-01' },
    ]);
  });

  it('ismeretlen betakarítású korábbi ültetés végét nem hozza előre', () => {
    const a = planting(1, { plan_harvest_start: null, plan_end_date: '2027-10-12' });
    const b = planting(2, { plan_transplant_date: '2027-06-01', plan_sow_date: '2027-04-01' });
    expect(clashFixes(a, b).map((f) => f.kind)).not.toContain('elozo_vege');
  });

  it('azonos kezdőnapon: az ágyásban álló, a mentett (kisebb azonosító), majd a korábban felvett új sáv a korábbi', () => {
    const s = (id: number, o: Partial<PlantingListItem> = {}) => planting(id, { ...saladDates, ...o });
    const shifted = (x: PlantingListItem, y: PlantingListItem) =>
      clashFixes(x, y).filter((f) => f.kind === 'kesobbi_eltolas').map((f) => f.plantingId);
    const cases: [string, PlantingListItem, PlantingListItem][] = [
      ['két mentett', s(3), s(5)],
      ['mentett és új', s(5), s(-1)],
      ['két új: a -1 előbb készült', s(-1), s(-2)],
      ['az ágyásban álló a kisebb azonosító előtt', s(5, { actual_sow_date: '2027-03-20' }), s(3)],
      // módszer nélkül a kiültetéstől áll az ágyásban, mint a foglaltságnál
      ['módszer nélkül a ténylegesen kiültetett az ágyásban áll', s(5, { method: null, plan_sow_date: null, actual_transplant_date: '2027-03-20' }), s(3)],
      // a tálcába vetett palánta még nincs az ágyásban: a kisebb azonosítójú a korábbi
      ['a tálcába vetett palánta még nincs az ágyásban', s(3), s(5, { method: 'palanta', plan_sow_date: '2027-02-01', actual_sow_date: '2027-02-01', plan_transplant_date: '2027-03-20' })],
    ];
    for (const [név, first, later] of cases) {
      expect(shifted(first, later), név).toEqual([later.id]);
      expect(shifted(later, first), név).toEqual([later.id]);
    }
  });
});
