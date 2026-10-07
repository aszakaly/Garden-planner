import type { LayoutPhase, PlantingMethod } from '../labels.ts';
import type { GrowingWindow, PlantingListItem } from '../types.ts';
import {
  methodsForWindow,
  shiftDates,
  suggestDates,
  usesSow,
  usesTransplant,
  type CropTiming,
  type FrostDates,
  type PlantingDates,
} from './dates.ts';
import { EPS, periodsOverlap, placementsOverlap, rangesOverlap, type Period, type Placement } from './geometry.ts';
import { addDaysISO, diffDays, isoFromMonthDay } from './isoDate.ts';
import { bedStartField, effectiveBedId, effectiveDates, occupancyPeriod, planDates } from './plantings.ts';

/**
 * A kiosztás-szerkesztő tiszta logikája. Minden érték cm, a `geometry.ts` koordinátáiban:
 * a tengely mentén követik egymást a sorok, a keresztirány egy sor hossza.
 */

/** Erre a rácsra ugranak a húzott élek. */
export const LAYOUT_GRID_CM = 5;
/** Ennél kisebb sávot a szerkesztő nem hoz létre (a régi, kisebb sávok megmaradhatnak). */
export const LAYOUT_MIN_CM = 10;

export type Dim = 'axis' | 'cross';
export type Edge = 'axisStart' | 'axisEnd' | 'crossStart' | 'crossEnd';

export interface LayoutStrip {
  key: number;
  placement: Placement;
  /**
   * Nem mozdítható: más évhez tartozik, vagy megkezdett, illetve rögzített (lásd `startedOrRecorded`:
   * előzmény, nem tervezett státusz, tény dátum, tényleges hely, vagy máshol valósult meg).
   * A szomszédja sem tolhatja el.
   */
  fixed?: boolean;
}

export interface LayoutSize {
  axis: number;
  cross: number;
}

export const snapCm = (v: number) => Math.round(v / LAYOUT_GRID_CM) * LAYOUT_GRID_CM;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const otherDim = (d: Dim): Dim => (d === 'axis' ? 'cross' : 'axis');

export const startOf = (p: Placement, d: Dim) => (d === 'axis' ? p.axis_start_cm : p.cross_start_cm);
export const spanOf = (p: Placement, d: Dim) => (d === 'axis' ? p.axis_span_cm : p.cross_span_cm);
export const endOf = (p: Placement, d: Dim) => startOf(p, d) + spanOf(p, d);

function withRange(p: Placement, d: Dim, start: number, end: number): Placement {
  return d === 'axis'
    ? { ...p, axis_start_cm: start, axis_span_cm: end - start }
    : { ...p, cross_start_cm: start, cross_span_cm: end - start };
}

/** A `d` irányban egymás mellett állnak-e (a másik irányban átfednek). */
const sideBySide = (a: Placement, b: Placement, d: Dim) =>
  rangesOverlap(startOf(a, otherDim(d)), endOf(a, otherDim(d)), startOf(b, otherDim(d)), endOf(b, otherDim(d)));

export const samePlacement = (a: Placement, b: Placement) =>
  (['axis', 'cross'] as const).every(
    (d) => Math.abs(startOf(a, d) - startOf(b, d)) < EPS && Math.abs(spanOf(a, d) - spanOf(b, d)) < EPS,
  );

/**
 * Elfogadható-e a módosítás: minden megváltozott sáv az ágyáson belül marad, nem fed át más
 * sávval, és minden irányban legalább minimális méretű – a régi, a minimumnál kisebb sáv
 * azonban nem lehet kisebb a korábbi méreténél. A változatlan régi adatot nem kéri számon.
 */
export function layoutValid(before: LayoutStrip[], after: LayoutStrip[], size: LayoutSize): boolean {
  const prev = new Map(before.map((s) => [s.key, s.placement]));
  // a korábbi méret az adott irányban (új sávnál nincs: a minimum érvényes)
  const prevSpan = (key: number, d: Dim) => {
    const p = prev.get(key);
    return p ? spanOf(p, d) : Infinity;
  };
  return after
    .filter((s) => {
      const p = prev.get(s.key);
      return !p || !samePlacement(p, s.placement);
    })
    .every(
      (s) =>
        (['axis', 'cross'] as const).every(
          (d) =>
            startOf(s.placement, d) >= -EPS &&
            endOf(s.placement, d) <= size[d] + EPS &&
            spanOf(s.placement, d) >= Math.min(LAYOUT_MIN_CM, prevSpan(s.key, d)) - EPS,
        ) && after.every((o) => o.key === s.key || !placementsOverlap(o.placement, s.placement)),
    );
}

/**
 * Egy él mozgatása. A mozgás irányában vele érintkező, nem rögzített sávok engednek
 * (legfeljebb a minimális méretükig); a többi sáv és az ágyás széle megállítja.
 * Visszahúzott élnél (az érintkezőktől távolodva) az engedő sávok követik, ha `follow`;
 * egyébként a helyükön maradnak. `self` az él mozgatása előtti állapot.
 */
function moveEdge(
  items: LayoutStrip[],
  self: LayoutStrip,
  d: Dim,
  atStart: boolean,
  delta: number,
  length: number,
  follow: boolean,
): LayoutStrip[] {
  const p0 = self.placement;
  const s0 = startOf(p0, d);
  const e0 = endOf(p0, d);
  // a szomszéd saját élei: `near` a mozgatott felé néző, `far` a másik
  const near = (x: LayoutStrip) => (atStart ? endOf(x.placement, d) : startOf(x.placement, d));
  const far = (x: LayoutStrip) => (atStart ? startOf(x.placement, d) : endOf(x.placement, d));
  const ahead = items.filter(
    (x) =>
      x.key !== self.key &&
      sideBySide(x.placement, p0, d) &&
      (atStart ? endOf(x.placement, d) <= s0 + EPS : startOf(x.placement, d) >= e0 - EPS),
  );
  const yielding = ahead.filter((x) => !x.fixed && Math.abs(near(x) - (atStart ? s0 : e0)) < EPS);
  // az engedő sáv határa sosem esik a mostani él mögé: a minimumnál keskenyebb régi sáv megállít
  const limits = ahead.map((x) =>
    yielding.includes(x)
      ? atStart
        ? Math.min(far(x) + LAYOUT_MIN_CM, s0)
        : Math.max(far(x) - LAYOUT_MIN_CM, e0)
      : near(x),
  );
  // a minimumnál keskenyebb régi sáv nem nőhet meg pusztán attól, hogy hozzáérnek (mint a layoutValid)
  const minSpan = Math.min(LAYOUT_MIN_CM, e0 - s0);
  const value = atStart
    ? clamp(snapCm(s0 + delta), Math.max(0, ...limits), e0 - minSpan)
    : clamp(snapCm(e0 + delta), s0 + minSpan, Math.min(length, ...limits));
  const retreating = atStart ? value > s0 : value < e0;
  return items.map((x) => {
    const p = x.placement;
    if (x.key === self.key) {
      return { ...x, placement: atStart ? withRange(p, d, value, endOf(p, d)) : withRange(p, d, startOf(p, d), value) };
    }
    if (!yielding.includes(x) || (retreating && !follow)) return x;
    return { ...x, placement: atStart ? withRange(p, d, startOf(p, d), value) : withRange(p, d, value, endOf(p, d)) };
  });
}

/**
 * Méretezés a megadott élekkel (sarokfogantyúnál kettővel). A `delta` a húzás kezdete óta
 * megtett út cm-ben; a `strips` a húzás kezdetekori állapot. null: a sáv nem méretezhető.
 */
export function resizeStrip(
  strips: LayoutStrip[],
  key: number,
  edges: Edge[],
  delta: LayoutSize,
  size: LayoutSize,
): LayoutStrip[] | null {
  const self = strips.find((s) => s.key === key);
  if (!self || self.fixed) return null;
  // előbb a követő változat; ha az érvénytelen (pl. a szomszéd másik szomszédba ütközne), a helyben maradó
  for (const follow of [true, false]) {
    let out = strips;
    for (const edge of edges) {
      const d: Dim = edge.startsWith('axis') ? 'axis' : 'cross';
      // a második élnél már az első él utáni állapotból kell számolni
      const current = out.find((s) => s.key === key)!;
      out = moveEdge(out, current, d, edge.endsWith('Start'), delta[d], size[d], follow);
    }
    if (layoutValid(strips, out, size)) return out;
  }
  return null;
}

/** Az azonos hosszúságú, a tengely mentén egymáshoz érő sávok lánca, amelyben a sáv áll. */
function chainOf(strips: LayoutStrip[], self: LayoutStrip): LayoutStrip[] {
  const same = strips
    .filter(
      (x) =>
        !x.fixed &&
        Math.abs(x.placement.cross_start_cm - self.placement.cross_start_cm) < EPS &&
        Math.abs(x.placement.cross_span_cm - self.placement.cross_span_cm) < EPS,
    )
    .sort((a, b) => a.placement.axis_start_cm - b.placement.axis_start_cm);
  let i = same.indexOf(self);
  let j = i;
  while (i > 0 && Math.abs(endOf(same[i - 1]!.placement, 'axis') - same[i]!.placement.axis_start_cm) < EPS) i--;
  while (j < same.length - 1 && Math.abs(endOf(same[j]!.placement, 'axis') - same[j + 1]!.placement.axis_start_cm) < EPS) j++;
  return same.slice(i, j + 1);
}

/** Szabad eltolás egy irányban: az ágyás széle és a mellette álló sávok megállítják (nem ugrik vissza). */
function freeShift(strips: LayoutStrip[], self: LayoutStrip, d: Dim, delta: number, length: number): number {
  const s0 = startOf(self.placement, d);
  const e0 = endOf(self.placement, d);
  const others = strips.filter((x) => x.key !== self.key && sideBySide(x.placement, self.placement, d));
  const lo = Math.max(0, ...others.filter((x) => endOf(x.placement, d) <= s0 + EPS).map((x) => endOf(x.placement, d)));
  const hi =
    Math.min(length, ...others.filter((x) => startOf(x.placement, d) >= e0 - EPS).map((x) => startOf(x.placement, d))) -
    spanOf(self.placement, d);
  return clamp(snapCm(s0 + delta), lo, Math.max(lo, hi));
}

/**
 * Mozgatás. Ha a sávot a tengely mentén a lánca egy tagjának közepén túlra húzzák,
 * helyet cserélnek (a lánc újra összezárva); egyébként a sáv szabadon mozdul, és az
 * akadály előtt megáll. null: a sáv nem mozgatható.
 */
export function moveStrip(strips: LayoutStrip[], key: number, delta: LayoutSize, size: LayoutSize): LayoutStrip[] | null {
  const self = strips.find((s) => s.key === key);
  if (!self || self.fixed) return null;
  const p = self.placement;

  if (Math.abs(delta.axis) >= Math.abs(delta.cross)) {
    const chain = chainOf(strips, self);
    const center = p.axis_start_cm + p.axis_span_cm / 2 + delta.axis;
    const rest = chain.filter((x) => x !== self);
    const index = rest.filter((x) => center > x.placement.axis_start_cm + x.placement.axis_span_cm / 2).length;
    const order = [...rest.slice(0, index), self, ...rest.slice(index)];
    if (order.some((x, i) => x !== chain[i])) {
      const moved = new Map<number, Placement>();
      let cursor = chain[0]!.placement.axis_start_cm;
      for (const x of order) {
        moved.set(x.key, withRange(x.placement, 'axis', cursor, cursor + x.placement.axis_span_cm));
        cursor += x.placement.axis_span_cm;
      }
      return strips.map((x) => {
        const placement = moved.get(x.key);
        return placement ? { ...x, placement } : x;
      });
    }
  }

  const axis = freeShift(strips, self, 'axis', delta.axis, size.axis);
  const cross = freeShift(strips, self, 'cross', delta.cross, size.cross);
  const tries = [
    { axis, cross },
    { axis, cross: p.cross_start_cm },
    { axis: p.axis_start_cm, cross },
  ];
  for (const t of tries) {
    const placement = { ...p, axis_start_cm: t.axis, cross_start_cm: t.cross };
    const out = strips.map((x) => (x.key === key ? { ...x, placement } : x));
    if (layoutValid(strips, out, size)) return out;
  }
  return null;
}

/** Kettévágás a sor hossza (keresztirány) mentén; a második fél az új kulcsot kapja. */
export function splitStrip(strips: LayoutStrip[], key: number, newKey: number): LayoutStrip[] | null {
  const self = strips.find((s) => s.key === key);
  if (!self || self.fixed) return null;
  const p = self.placement;
  if (p.cross_span_cm < 2 * LAYOUT_MIN_CM - EPS) return null;
  const cut = p.cross_start_cm + clamp(snapCm(p.cross_span_cm / 2), LAYOUT_MIN_CM, p.cross_span_cm - LAYOUT_MIN_CM);
  return [
    ...strips.map((x) => (x.key === key ? { ...x, placement: withRange(p, 'cross', p.cross_start_cm, cut) } : x)),
    { key: newKey, placement: withRange(p, 'cross', cut, endOf(p, 'cross')) },
  ];
}

/** Egy sor a sávlistában: az azonos tengelyszakaszon álló sávok. */
export interface LayoutRow {
  start: number;
  span: number;
  keys: number[];
}

/** Sorok a tengely mentén, azon belül a sor hossza szerint rendezve. */
export function layoutRows(strips: LayoutStrip[]): LayoutRow[] {
  const sorted = [...strips].sort(
    (a, b) =>
      a.placement.axis_start_cm - b.placement.axis_start_cm ||
      a.placement.axis_span_cm - b.placement.axis_span_cm ||
      a.placement.cross_start_cm - b.placement.cross_start_cm,
  );
  const rows: LayoutRow[] = [];
  for (const s of sorted) {
    const row = rows.find(
      (r) => Math.abs(r.start - s.placement.axis_start_cm) < EPS && Math.abs(r.span - s.placement.axis_span_cm) < EPS,
    );
    if (row) row.keys.push(s.key);
    else rows.push({ start: s.placement.axis_start_cm, span: s.placement.axis_span_cm, keys: [s.key] });
  }
  return rows;
}

/** Átrendezhetők-e a sorok: egyik sem fed át részben egy másikkal. */
export const rowsReorderable = (rows: LayoutRow[]) =>
  rows.every((r, i) =>
    rows.every((q, j) => i === j || r.start + r.span <= q.start + EPS || q.start + q.span <= r.start + EPS),
  );

/** Egy sor áthelyezése a sorrendben; a sorok közötti hézagok a helyükön maradnak. */
export function moveRow(strips: LayoutStrip[], rows: LayoutRow[], from: number, to: number): LayoutStrip[] | null {
  if (from === to || !rowsReorderable(rows) || strips.some((s) => s.fixed)) return null;
  const order = [...rows];
  const [row] = order.splice(from, 1);
  if (!row) return null;
  order.splice(to, 0, row);
  const gaps = rows.slice(1).map((r, i) => r.start - (rows[i]!.start + rows[i]!.span));
  const shift = new Map<number, number>();
  let cursor = rows[0]!.start;
  order.forEach((r, i) => {
    for (const k of r.keys) shift.set(k, cursor - r.start);
    cursor += r.span + (gaps[i] ?? 0);
  });
  return strips.map((s) => {
    const by = shift.get(s.key);
    return by ? { ...s, placement: { ...s.placement, axis_start_cm: s.placement.axis_start_cm + by } } : s;
  });
}

/** A sor szélessége léptetővel: a sor vége mozdul, ha ott nincs hely, az eleje. null: nincs hely. */
export function resizeRow(strips: LayoutStrip[], row: LayoutRow, delta: number, size: LayoutSize): LayoutStrip[] | null {
  const own = strips.filter((s) => row.keys.includes(s.key));
  if (!own.length || own.some((s) => s.fixed)) return null;
  // a sor minden sávja ugyanarra a helyre és szélességre kerüljön, és a szélesség változzon
  const consistent = (out: LayoutStrip[]) => {
    const moved = out.filter((s) => row.keys.includes(s.key)).map((s) => s.placement);
    const first = moved[0]!;
    return (
      Math.abs(first.axis_span_cm - row.span) >= EPS &&
      moved.every(
        (q) =>
          Math.abs(q.axis_start_cm - first.axis_start_cm) < EPS && Math.abs(q.axis_span_cm - first.axis_span_cm) < EPS,
      )
    );
  };
  for (const atStart of [false, true]) {
    for (const follow of [true, false]) {
      let out = strips;
      for (const self of own) out = moveEdge(out, self, 'axis', atStart, atStart ? -delta : delta, size.axis, follow);
      if (layoutValid(strips, out, size) && consistent(out)) return out;
    }
  }
  return null;
}

/** Két érintkező sáv közös határa: a `dim` irányban az `at` helyen, a másik irányban from–to között. */
export interface Boundary {
  a: number;
  b: number;
  dim: Dim;
  at: number;
  from: number;
  to: number;
}

export function boundaries(strips: LayoutStrip[]): Boundary[] {
  const out: Boundary[] = [];
  for (const a of strips) {
    for (const b of strips) {
      if (a.key === b.key) continue;
      for (const d of ['axis', 'cross'] as const) {
        if (Math.abs(endOf(a.placement, d) - startOf(b.placement, d)) >= EPS) continue;
        const o = otherDim(d);
        const from = Math.max(startOf(a.placement, o), startOf(b.placement, o));
        const to = Math.min(endOf(a.placement, o), endOf(b.placement, o));
        if (to - from > EPS) out.push({ a: a.key, b: b.key, dim: d, at: endOf(a.placement, d), from, to });
      }
    }
  }
  return out;
}

// --- Új sáv ------------------------------------------------------------------

/**
 * Új sáv helye a szabad szakaszok közül (a hívó a `freeAxisRanges`-szel számolja az új
 * ültetés teljes időszakára, teljes hosszban): az első, ahová a kért szélesség befér;
 * ilyen híján a legnagyobb, legalább minimális szakasz, kitöltve. null: nincs szabad hely.
 */
export function placeInFree(free: [number, number][], span: number, crossLength: number): Placement | null {
  const full = (start: number, width: number) => ({
    axis_start_cm: start,
    axis_span_cm: width,
    cross_start_cm: 0,
    cross_span_cm: crossLength,
  });
  // a szakaszok a rácsra igazodnak (eleje felfelé, vége lefelé); a minimumnál rövidebb nem számít
  const ranges = free
    .map(([s, e]): [number, number] => [
      Math.ceil(s / LAYOUT_GRID_CM) * LAYOUT_GRID_CM,
      Math.floor(e / LAYOUT_GRID_CM) * LAYOUT_GRID_CM,
    ])
    .filter(([s, e]) => e - s >= LAYOUT_MIN_CM - EPS);
  const fits = ranges.find(([s, e]) => e - s + EPS >= span);
  if (fits) return full(fits[0], span);
  const largest = [...ranges].sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  return largest ? full(largest[0], largest[1] - largest[0]) : null;
}

/**
 * Hely híján: az új sáv a cél sáv végére kerül, a cél sáv pedig enged neki (a minimális
 * méretéig). A kért szélesség és a két sáv közös határa a rácsra kerül; mindkét sáv legalább
 * minimális marad. Csak a pillanatkép napján látható sávokat ismeri; az időbeli ütközések az
 * ütközéslistában jelennek meg.
 */
export function makeRoom(
  strips: LayoutStrip[],
  targetKey: number,
  span: number,
): { strips: LayoutStrip[]; placement: Placement } | null {
  const target = strips.find((s) => s.key === targetKey);
  if (!target || target.fixed) return null;
  const p = target.placement;
  const start = p.axis_start_cm;
  const end = endOf(p, 'axis');
  const want = Math.max(LAYOUT_MIN_CM, snapCm(span));
  // a határ rácspontjai: a cél sáv és az új is legalább minimális marad; ilyen pont híján
  // (kb. 20 cm-nél keskenyebb cél sávnál) nincs hely
  const lo = Math.ceil((start + LAYOUT_MIN_CM - EPS) / LAYOUT_GRID_CM) * LAYOUT_GRID_CM;
  const hi = Math.floor((end - LAYOUT_MIN_CM + EPS) / LAYOUT_GRID_CM) * LAYOUT_GRID_CM;
  if (hi < lo) return null;
  const cut = clamp(snapCm(end - want), lo, hi);
  return {
    strips: strips.map((s) => (s.key === targetKey ? { ...s, placement: withRange(p, 'axis', start, cut) } : s)),
    placement: withRange(p, 'axis', cut, end),
  };
}

/** Teljes hosszú-e a sáv: a keresztirányban az ágyás egész hosszán fut. */
export const isFullLength = (pl: Placement, crossLength: number) =>
  Math.abs(pl.cross_start_cm) < EPS && Math.abs(pl.cross_span_cm - crossLength) < EPS;

// --- Időpontok és vetési ablak --------------------------------------------------

/** Az elő-, fő- és utóvetemény pillanatképének napja: utolsó fagy − 4 hét, július 1., első fagy − 4 hét. */
export function phaseDays(year: number, frost: FrostDates): Record<LayoutPhase, string> {
  return {
    elo: addDaysISO(isoFromMonthDay(year, frost.lastFrost), -28),
    fo: `${year}-07-01`,
    uto: addDaysISO(isoFromMonthDay(year, frost.firstFrost), -28),
  };
}

export interface WindowChoice {
  window: GrowingWindow;
  method: PlantingMethod;
  dates: PlantingDates;
  period: Period;
}

/**
 * Melyik vetési ablakból jöjjön az új sáv: amelyikben a növény a napon az ágyásban áll
 * (több közül a legkésőbb kezdődő); ha egyik sem, a nap utáni legközelebbi, végül a nap előtti.
 */
export function pickWindowForDay(
  windows: GrowingWindow[],
  day: string,
  opts: { year: number; crop: CropTiming; frost: FrostDates },
): WindowChoice | null {
  const choices = windows.flatMap((w) => {
    const method = methodsForWindow(w.method)[0]!;
    const dates = suggestDates({ year: opts.year, window: w, method, crop: opts.crop, frost: opts.frost });
    const period = occupancyPeriod({
      year: opts.year,
      method,
      status: 'terv',
      perennial: opts.crop.perennial,
      plan_sow_date: usesSow(method) ? dates.sow : null,
      plan_transplant_date: usesTransplant(method) ? dates.transplant : null,
      plan_harvest_start: dates.harvestStart,
      plan_end_date: dates.end,
      actual_sow_date: null,
      actual_transplant_date: null,
      actual_harvest_start: null,
      actual_end_date: null,
    });
    return period ? [{ window: w, method, dates, period }] : [];
  });
  const byStartDesc = (a: WindowChoice, b: WindowChoice) => b.period.start.localeCompare(a.period.start);
  const containing = choices.filter((c) => c.period.start <= day && day < c.period.end).sort(byStartDesc);
  const after = choices.filter((c) => c.period.start > day).sort((a, b) => a.period.start.localeCompare(b.period.start));
  const before = choices.filter((c) => c.period.end <= day).sort(byStartDesc);
  return containing[0] ?? after[0] ?? before[0] ?? null;
}

// --- Kapcsolt ültetések és ütközésjavítás ------------------------------------------

const PLAN_DATE_KEYS = ['plan_sow_date', 'plan_transplant_date', 'plan_harvest_start', 'plan_end_date'] as const;

/**
 * Kapcsolt ültetések: ugyanabban az ágyásban és évben, azonos növény, fajta, módszer és
 * mind a négy tervezett dátum. Nem számít az elmaradt, a sikertelen, a lezárt, a tényleges
 * véggel rendelkező és a gyors előzmény; a folyamatban lévő igen. Vetési vagy ültetési
 * dátum nélküli ültetés (pl. az előző évről átvitt évelő) soha nem kapcsolódik.
 */
export function linkedPlantings(p: PlantingListItem, all: PlantingListItem[]): PlantingListItem[] {
  const eligible = (x: PlantingListItem) =>
    !x.is_history && !['elmaradt', 'sikertelen', 'lezart'].includes(x.status) && !x.actual_end_date;
  const bed = effectiveBedId(p);
  if (!eligible(p) || bed == null || !(p.plan_sow_date || p.plan_transplant_date)) return [];
  return all.filter(
    (x) =>
      x.id !== p.id &&
      eligible(x) &&
      x.year === p.year &&
      effectiveBedId(x) === bed &&
      x.plant_id === p.plant_id &&
      x.variety_id === p.variety_id &&
      x.method === p.method &&
      PLAN_DATE_KEYS.every((k) => x[k] === p[k]),
  );
}

export type ClashFix =
  /** Az előző ültetés helye ezen a napon szabadul fel */
  | { kind: 'elozo_vege'; plantingId: number; date: string }
  /** A későbbi ültetés minden tervezett dátuma ennyi nappal később */
  | { kind: 'kesobbi_eltolas'; plantingId: number; days: number; date: string };

/** A javítás alkalmazása egy ültetés tervezett dátumaira. */
export function applyClashFix(p: PlantingListItem, fix: ClashFix): PlantingListItem {
  if (fix.kind === 'elozo_vege') return { ...p, plan_end_date: fix.date };
  const d = shiftDates(planDates(p), fix.days);
  return { ...p, plan_sow_date: d.sow, plan_transplant_date: d.transplant, plan_harvest_start: d.harvestStart, plan_end_date: d.end };
}

/**
 * Javítások két, ugyanott és egyszerre álló ültetésre (egymást nem fedő időszakokra nincs).
 * Csak olyat kínál, amelynek alkalmazása után az időszakok tényleg nem fedik egymást. Az előző
 * vége csak akkor hozható előre, ha még nincs tényleges vége, a betakarítás kezdete ismert, és
 * a vég nem kerül elé. A későbbi az előző (becsült) vége utánra tolható, ha még nem került az
 * ágyásba és a kezdete a tervezett dátumból jön; az eltolt időszak még az évben kezdődik, és a
 * vége nem csúszik át a következő évre (az áttelelő az marad, az idei termés nem lesz jövő évi).
 * Azonos kezdőnapon a korábbi az, amelyik már az ágyásban áll, majd a mentett ültetés
 * (pozitív azonosító) az új sáv (negatív) előtt; a mentettek közül az alacsonyabb, az újak
 * közül a korábban felvett (-1, -2, … sorrendben) azonosítójú.
 */
export function clashFixes(x: PlantingListItem, y: PlantingListItem): ClashFix[] {
  const px = occupancyPeriod(x);
  const py = occupancyPeriod(y);
  if (!px || !py || !periodsOverlap(px, py)) return [];
  // már az ágyásban áll: a foglaltság kezdőnapja (a terv és a tény közül az érvényes) tény dátum
  const inBed = (p: PlantingListItem) => {
    const field = bedStartField(p.method, effectiveDates(p));
    return field != null && (field === 'sow' ? p.actual_sow_date : p.actual_transplant_date) != null;
  };
  const earlier = (): boolean => {
    if (px.start !== py.start) return px.start < py.start;
    if (inBed(x) !== inBed(y)) return inBed(x);
    if (x.id > 0 !== y.id > 0) return x.id > 0;
    // a mentettek a kisebb azonosítóval, az újak a felvétel sorrendjében (-1 a -2 előtt)
    return Math.abs(x.id) < Math.abs(y.id);
  };
  const [a, pa, b, pb] = earlier() ? [x, px, y, py] : [y, py, x, px];
  const out: ClashFix[] = [];
  const harvestA = effectiveDates(a).harvestStart;
  if (!a.actual_end_date && harvestA && pb.start > pa.start && pb.start >= harvestA) {
    const fix: ClashFix = { kind: 'elozo_vege', plantingId: a.id, date: pb.start };
    if (removesClash(a, fix, pb)) out.push(fix);
  }
  if (!inBed(b) && bedStartField(b.method, planDates(b))) {
    const fix: ClashFix = { kind: 'kesobbi_eltolas', plantingId: b.id, days: diffDays(pb.start, pa.end), date: pa.end };
    // a ténylegesen eltolt időszakkal (módszer nélkül pl. a kiültetéstől) számol
    const shifted = occupancyPeriod(applyClashFix(b, fix));
    if (shifted && shifted.start < `${b.year}-12-31` && lastYear(shifted) === lastYear(pb) && !periodsOverlap(shifted, pa)) {
      out.push(fix);
    }
  }
  return out;
}

/** Az időszak utolsó foglalt napjának éve (a záró napon a hely már szabad). */
const lastYear = (p: Period) => addDaysISO(p.end, -1).slice(0, 4);

/** A javított ültetés időszaka már nem fedi a másikét. */
function removesClash(p: PlantingListItem, fix: ClashFix, other: Period): boolean {
  const period = occupancyPeriod(applyClashFix(p, fix));
  return period != null && !periodsOverlap(period, other);
}
