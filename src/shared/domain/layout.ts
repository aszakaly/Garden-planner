import { placementsOverlap, rangesOverlap, type Placement } from './geometry.ts';

/**
 * A kiosztás-szerkesztő tiszta logikája. Minden érték cm, a `geometry.ts` koordinátáiban:
 * a tengely mentén követik egymást a sorok, a keresztirány egy sor hossza.
 */

/** Erre a rácsra ugranak a húzott élek. */
export const LAYOUT_GRID_CM = 5;
/** Ennél kisebb sávot a szerkesztő nem hoz létre (a régi, kisebb sávok megmaradhatnak). */
export const LAYOUT_MIN_CM = 10;
const EPS = 0.5;

export type Dim = 'axis' | 'cross';
export type Edge = 'axisStart' | 'axisEnd' | 'crossStart' | 'crossEnd';

export interface LayoutStrip {
  key: number;
  placement: Placement;
  /**
   * Nem mozdítható: más évhez tartozik, már megtörtént (tény adat), vagy tényleges helye van.
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
