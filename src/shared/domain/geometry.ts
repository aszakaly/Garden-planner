import type { RowDirection } from '../labels.ts';

/**
 * Ágyáson belüli elhelyezés. Az ültetések sávokban követik egymást a „tengely” mentén:
 * keresztben futó soroknál ez az ágyás hossza, hosszában futó soroknál a szélessége.
 * A másik irány a „keresztirány” (egy sor hossza). Minden érték cm, az ágyás sarkától mérve.
 */

export interface BedGeometry {
  length_cm: number;
  width_cm: number;
  row_direction: RowDirection;
}

export interface Placement {
  axis_start_cm: number;
  axis_span_cm: number;
  cross_start_cm: number;
  cross_span_cm: number;
}

/** Időszak ISO dátumokkal. A záró napon a hely már újra felhasználható. */
export interface Period {
  start: string;
  end: string;
}

export interface Occupant {
  id?: number;
  placement: Placement;
  period: Period;
}

const EPS = 0.5;

export function bedAxes(bed: BedGeometry): { axis: number; cross: number } {
  return bed.row_direction === 'keresztben'
    ? { axis: bed.length_cm, cross: bed.width_cm }
    : { axis: bed.width_cm, cross: bed.length_cm };
}

/** Sávszélesség a sorok számából: soronként egy sortáv. */
export function spanForRows(rows: number, rowSpacingCm: number | null): number {
  return Math.max(1, rows) * (rowSpacingCm || 30);
}

export function rowsForSpan(spanCm: number, rowSpacingCm: number | null): number {
  return Math.max(1, Math.floor((spanCm + EPS) / (rowSpacingCm || 30)));
}

/** Becsült tőszám: sorok × (sorhossz / tőtáv). */
export function estimatePlantCount(rows: number | null, crossSpanCm: number, inRowSpacingCm: number | null): number | null {
  if (!rows || !inRowSpacingCm) return null;
  return rows * Math.max(1, Math.floor((crossSpanCm + EPS) / inRowSpacingCm));
}

export const rangesOverlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - EPS && b0 < a1 - EPS;

export const periodsOverlap = (a: Period, b: Period) => a.start < b.end && b.start < a.end;

export function placementsOverlap(a: Placement, b: Placement): boolean {
  return (
    rangesOverlap(a.axis_start_cm, a.axis_start_cm + a.axis_span_cm, b.axis_start_cm, b.axis_start_cm + b.axis_span_cm) &&
    rangesOverlap(
      a.cross_start_cm,
      a.cross_start_cm + a.cross_span_cm,
      b.cross_start_cm,
      b.cross_start_cm + b.cross_span_cm,
    )
  );
}

/** Szomszédosnak számít két sáv, ha legfeljebb ennyi cm választja el őket. */
export const NEIGHBOUR_GAP_CM = 10;

const gapBetween = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, b0 - a1, a0 - b1);

/** Közvetlen szomszédok (vagy átfedők): mindkét irányban legfeljebb `gap` cm távolságra. */
export function placementsAdjacent(a: Placement, b: Placement, gap = NEIGHBOUR_GAP_CM): boolean {
  const axis = gapBetween(a.axis_start_cm, a.axis_start_cm + a.axis_span_cm, b.axis_start_cm, b.axis_start_cm + b.axis_span_cm);
  const cross = gapBetween(
    a.cross_start_cm,
    a.cross_start_cm + a.cross_span_cm,
    b.cross_start_cm,
    b.cross_start_cm + b.cross_span_cm,
  );
  return axis <= gap + EPS && cross <= gap + EPS;
}

export const occupantsClash = (a: Occupant, b: Occupant) =>
  periodsOverlap(a.period, b.period) && placementsOverlap(a.placement, b.placement);

/** A két időszak közös része. */
export const periodIntersection = (a: Period, b: Period): Period => ({
  start: a.start > b.start ? a.start : b.start,
  end: a.end < b.end ? a.end : b.end,
});

/**
 * A tengely szabad szakaszai egy időszakban (a keresztirányban átfedő, időben ütköző
 * ültetéseket foglaltnak tekintve).
 */
export function freeAxisRanges(
  axisLength: number,
  others: Occupant[],
  period: Period,
  cross: { start: number; span: number },
): [number, number][] {
  const busy = others
    .filter(
      (o) =>
        periodsOverlap(o.period, period) &&
        rangesOverlap(o.placement.cross_start_cm, o.placement.cross_start_cm + o.placement.cross_span_cm, cross.start, cross.start + cross.span),
    )
    .map((o) => [o.placement.axis_start_cm, o.placement.axis_start_cm + o.placement.axis_span_cm] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const free: [number, number][] = [];
  let cursor = 0;
  for (const [s, e] of busy) {
    if (s > cursor + EPS) free.push([cursor, Math.min(s, axisLength)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < axisLength - EPS) free.push([cursor, axisLength]);
  return free.filter(([s, e]) => e - s > EPS);
}

/** Az első hely, ahová a sáv befér az adott időszakban; null, ha sehol nincs elég hely. */
export function firstFreeStart(
  axisLength: number,
  others: Occupant[],
  period: Period,
  span: number,
  cross: { start: number; span: number },
): number | null {
  const hit = freeAxisRanges(axisLength, others, period, cross).find(([s, e]) => e - s + EPS >= span);
  return hit ? hit[0] : null;
}

export interface Clash {
  a: number;
  b: number;
  period: Period;
}

/** Ugyanazon ágyás ültetései közül azok a párok, amelyek egyszerre ugyanazt a helyet foglalnák. */
export function findClashes(items: (Occupant & { id: number })[]): Clash[] {
  const out: Clash[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      if (occupantsClash(a, b)) out.push({ a: a.id, b: b.id, period: periodIntersection(a.period, b.period) });
    }
  }
  return out;
}

/** Kilóg-e a sáv az ágyásból. */
export function outsideBed(p: Placement, bed: BedGeometry): boolean {
  const { axis, cross } = bedAxes(bed);
  return (
    p.axis_start_cm < -EPS ||
    p.cross_start_cm < -EPS ||
    p.axis_start_cm + p.axis_span_cm > axis + EPS ||
    p.cross_start_cm + p.cross_span_cm > cross + EPS
  );
}

/**
 * A sáv az ágyás hossza mentén (a felülnézet vízszintes irányában), függetlenül a sorok irányától:
 * kezdet és hossz, valamint a szélességből elfoglalt rész (cm).
 */
export function alongLength(p: Placement, bed: BedGeometry) {
  return bed.row_direction === 'keresztben'
    ? { start: p.axis_start_cm, span: p.axis_span_cm, widthStart: p.cross_start_cm, widthSpan: p.cross_span_cm }
    : { start: p.cross_start_cm, span: p.cross_span_cm, widthStart: p.axis_start_cm, widthSpan: p.axis_span_cm };
}
