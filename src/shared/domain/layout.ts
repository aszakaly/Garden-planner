import { placementsOverlap, rangesOverlap, type Placement } from './geometry.ts';

/**
 * A kiosztás-szerkesztő tiszta logikája. Minden érték cm, a `geometry.ts` koordinátáiban:
 * a tengely mentén követik egymást a sorok, a keresztirány egy sor hossza.
 */

/** Erre a rácsra ugranak a húzott élek; ennél kisebb sáv nem lehet. */
export const LAYOUT_GRID_CM = 5;
export const LAYOUT_MIN_CM = 10;
const EPS = 0.5;

export type Dim = 'axis' | 'cross';
export type Edge = 'axisStart' | 'axisEnd' | 'crossStart' | 'crossEnd';

export interface LayoutStrip {
  key: number;
  placement: Placement;
  /** Nem mozdítható (más évhez tartozik, vagy tényleges helye van): a szomszédja sem tolhatja el */
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
 * Elfogadható-e a módosítás: minden megváltozott sáv az ágyáson belül marad, legalább
 * minimális méretű, és nem fed át más sávval. A régi, rendezetlen adatot nem kéri számon.
 */
export function layoutValid(before: LayoutStrip[], after: LayoutStrip[], size: LayoutSize): boolean {
  const prev = new Map(before.map((s) => [s.key, s.placement]));
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
            spanOf(s.placement, d) >= LAYOUT_MIN_CM - EPS,
        ) && after.every((o) => o.key === s.key || !placementsOverlap(o.placement, s.placement)),
    );
}

/**
 * Egy él mozgatása. A mozgás irányában vele érintkező, nem rögzített sávok engednek
 * (legfeljebb a minimális méretükig), és visszafelé húzva követik; a többi sáv és az ágyás
 * széle megállítja. `self` a húzás kezdetekori állapot.
 */
function moveEdge(
  items: LayoutStrip[],
  self: LayoutStrip,
  d: Dim,
  atStart: boolean,
  delta: number,
  length: number,
): LayoutStrip[] {
  const p0 = self.placement;
  const s0 = startOf(p0, d);
  const e0 = endOf(p0, d);
  const ahead = items.filter(
    (x) =>
      x.key !== self.key &&
      sideBySide(x.placement, p0, d) &&
      (atStart ? endOf(x.placement, d) <= s0 + EPS : startOf(x.placement, d) >= e0 - EPS),
  );
  const yielding = ahead.filter(
    (x) => !x.fixed && Math.abs((atStart ? endOf(x.placement, d) : startOf(x.placement, d)) - (atStart ? s0 : e0)) < EPS,
  );
  const limits = ahead.map((x) =>
    yielding.includes(x)
      ? atStart
        ? startOf(x.placement, d) + LAYOUT_MIN_CM
        : endOf(x.placement, d) - LAYOUT_MIN_CM
      : atStart
        ? endOf(x.placement, d)
        : startOf(x.placement, d),
  );
  const value = atStart
    ? clamp(snapCm(s0 + delta), Math.max(0, ...limits), e0 - LAYOUT_MIN_CM)
    : clamp(snapCm(e0 + delta), s0 + LAYOUT_MIN_CM, Math.min(length, ...limits));
  return items.map((x) => {
    const p = x.placement;
    if (x.key === self.key) {
      return { ...x, placement: atStart ? withRange(p, d, value, endOf(p, d)) : withRange(p, d, startOf(p, d), value) };
    }
    if (!yielding.includes(x)) return x;
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
  let out = strips;
  for (const edge of edges) {
    const d: Dim = edge.startsWith('axis') ? 'axis' : 'cross';
    out = moveEdge(out, self, d, edge.endsWith('Start'), delta[d], size[d]);
  }
  return layoutValid(strips, out, size) ? out : null;
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

/**
 * Mozgatás. Ha a sávot a tengely mentén a lánca egy tagjának közepén túlra húzzák,
 * helyet cserélnek (a lánc újra összezárva); egyébként a sáv szabad helyre mozdul,
 * foglalt helyre nem. null: a sáv nem mozgatható.
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

  const axis = clamp(snapCm(p.axis_start_cm + delta.axis), 0, size.axis - p.axis_span_cm);
  const cross = clamp(snapCm(p.cross_start_cm + delta.cross), 0, size.cross - p.cross_span_cm);
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
  for (const atStart of [false, true]) {
    let out = strips;
    for (const self of own) out = moveEdge(out, self, 'axis', atStart, atStart ? -delta : delta, size.axis);
    const first = out.find((s) => s.key === own[0]!.key)!;
    if (Math.abs(first.placement.axis_span_cm - row.span) >= EPS && layoutValid(strips, out, size)) return out;
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
