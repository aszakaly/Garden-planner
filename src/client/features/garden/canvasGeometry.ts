import type { Placement } from '@shared/domain/geometry.ts';
import { LAYOUT_GRID_CM, samePlacement, type Dim, type Edge, type LayoutSize, type LayoutStrip } from '@shared/domain/layout.ts';

/** Az ágyásképek (`BedDiagram`, `LayoutCanvas`) mellékhatás nélküli geometriai segédei. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sáv helye a képernyőn: vízszintesen mindig az ágyás hossza fut. */
export function rectOf(p: Placement, across: boolean, scale = 1): Rect {
  return across
    ? { x: p.axis_start_cm * scale, y: p.cross_start_cm * scale, w: p.axis_span_cm * scale, h: p.cross_span_cm * scale }
    : { x: p.cross_start_cm * scale, y: p.axis_start_cm * scale, w: p.cross_span_cm * scale, h: p.axis_span_cm * scale };
}

/** A szerkeszthető ágyáskép margói képpontban (a méretfeliratok helye). */
export const CANVAS_PAD = { left: 34, top: 10, right: 12, bottom: 26 } as const;
/** Az ágyáskép legnagyobb magassága képpontban (a margókkal együtt). */
export const CANVAS_MAX_H = 380;

export interface CanvasFit {
  /** képpont / cm */
  scale: number;
  /** Az ágyás mérete képpontban */
  w: number;
  h: number;
  /** A teljes kép (a viewBox) mérete képpontban */
  viewW: number;
  viewH: number;
  /** Az ágyás bal felső sarka a képen */
  left: number;
  top: number;
}

/**
 * Az ágyáskép méretezése a tényleges szélességhez: a viewBox egysége egy CSS-képpont, így a
 * feliratok, fogantyúk és érintési sávok telefonon és asztalon is ugyanakkorák. Az ágyás kitölti
 * a szélességet, de a kép legfeljebb `CANVAS_MAX_H` magas (ekkor az ágyás vízszintesen középre kerül).
 */
export function canvasFit(widthPx: number, lengthCm: number, widthCm: number): CanvasFit {
  const pad = CANVAS_PAD;
  const availW = Math.max(1, widthPx - pad.left - pad.right);
  const availH = Math.max(1, CANVAS_MAX_H - pad.top - pad.bottom);
  const scale = Math.min(availW / lengthCm, availH / widthCm);
  const w = lengthCm * scale;
  const h = widthCm * scale;
  return {
    scale,
    w,
    h,
    viewW: Math.max(widthPx, w + pad.left + pad.right),
    viewH: h + pad.top + pad.bottom,
    left: pad.left + (availW - w) / 2,
    top: pad.top,
  };
}

export type Side = 'l' | 'r' | 't' | 'b';
/** Fogantyú: egy él vagy egy sarok (két él) */
export type ZoneId = Side | `${'l' | 'r'}${'t' | 'b'}`;

export interface HandleZone extends Rect {
  id: ZoneId;
  sides: Side[];
}

/**
 * A kijelölt sáv fogantyúinak érintési területei. Kifelé `hit`-nyire nyúlnak, befelé legfeljebb
 * a sáv adott méretének negyedéig: keskeny sávnál is marad a közepén mozgatásra szolgáló rész.
 */
export function handleZones(r: Rect, hit: number): HandleZone[] {
  const inX = Math.min(hit, r.w / 4);
  const inY = Math.min(hit, r.h / 4);
  const cols = {
    l: { x: r.x - hit, w: hit + inX },
    mid: { x: r.x + inX, w: r.w - 2 * inX },
    r: { x: r.x + r.w - inX, w: inX + hit },
  };
  const rows = {
    t: { y: r.y - hit, h: hit + inY },
    mid: { y: r.y + inY, h: r.h - 2 * inY },
    b: { y: r.y + r.h - inY, h: inY + hit },
  };
  const zones: HandleZone[] = [
    { id: 'l', sides: ['l'], ...cols.l, ...rows.mid },
    { id: 'r', sides: ['r'], ...cols.r, ...rows.mid },
    { id: 't', sides: ['t'], ...cols.mid, ...rows.t },
    { id: 'b', sides: ['b'], ...cols.mid, ...rows.b },
    { id: 'lt', sides: ['l', 't'], ...cols.l, ...rows.t },
    { id: 'rt', sides: ['r', 't'], ...cols.r, ...rows.t },
    { id: 'lb', sides: ['l', 'b'], ...cols.l, ...rows.b },
    { id: 'rb', sides: ['r', 'b'], ...cols.r, ...rows.b },
  ];
  return zones.filter((z) => z.w > 0 && z.h > 0);
}

/** Az élek által változtatott irányok; mozgatásnál (`null`) mindkettő. */
export function dimsOf(edges: Edge[] | null): Dim[] {
  if (!edges) return ['axis', 'cross'];
  return [...new Set(edges.map((e): Dim => (e.startsWith('axis') ? 'axis' : 'cross')))];
}

/** Eléri-e az elmozdulás a küszöböt (cm) legalább az egyik megadott irányban. */
export const exceeds = (delta: LayoutSize, dims: Dim[], cm: number) => dims.some((d) => Math.abs(delta[d]) >= cm);

/**
 * A húzás indítási küszöbe cm-ben: legalább a rácsköz fele, és legalább `slopPx` képpont,
 * hogy a koppintás közbeni remegés ne mozdítsa el a sávot.
 */
export const slopCm = (slopPx: number, pxPerCm: number) => Math.max(LAYOUT_GRID_CM / 2, slopPx / pxPerCm);

/** Ugyanaz-e a két kiosztás (ugyanazok a sávok, ugyanott). */
export function sameStrips(a: LayoutStrip[], b: LayoutStrip[]): boolean {
  return a === b || (a.length === b.length && a.every((x, i) => x.key === b[i]!.key && samePlacement(x.placement, b[i]!.placement)));
}
