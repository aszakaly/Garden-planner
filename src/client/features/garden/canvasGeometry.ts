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

/** A szerkeszthető ágyáskép alap margói képpontban (a méretfeliratok helye). */
export const CANVAS_PAD = { left: 34, top: 10, right: 12, bottom: 26 } as const;
/** Az ágyáskép legnagyobb magassága képpontban (a margókkal együtt). */
export const CANVAS_MAX_H = 380;

export type CanvasPad = { [K in keyof typeof CANVAS_PAD]: number };

/**
 * A margók képpontban: legalább a fogantyúk érintési sávjának fele (`hit`), hogy az ágyás szélén
 * álló sáv kifelé nyúló fogantyúit se vágja le a kép széle. Egérrel (`hit` 11) csak a felső margó
 * nő egy képponttal, ujjal (22) a felső és a jobb oldali.
 */
export function canvasPad(hit = 0): CanvasPad {
  return {
    left: Math.max(CANVAS_PAD.left, hit),
    top: Math.max(CANVAS_PAD.top, hit),
    right: Math.max(CANVAS_PAD.right, hit),
    bottom: Math.max(CANVAS_PAD.bottom, hit),
  };
}

/**
 * A kép legnagyobb magassága az ablak magasságához mérten: legfeljebb az ablak fele, hogy fekvő
 * telefonon is maradjon hely a kép mellett görgetni (a képen az érintés nem görget).
 * Ismeretlen ablakmagasságnál `CANVAS_MAX_H`.
 */
export const canvasMaxH = (windowH: number | null) =>
  windowH && windowH > 0 ? Math.min(CANVAS_MAX_H, Math.round(windowH * 0.5)) : CANVAS_MAX_H;

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
 * a szélességet, de a kép legfeljebb `maxH` magas (ekkor az ágyás vízszintesen középre kerül).
 * A margók a fogantyúk érintési sávjától (`hit`) függnek, lásd `canvasPad`.
 */
export function canvasFit(
  widthPx: number,
  lengthCm: number,
  widthCm: number,
  { hit = 0, maxH = CANVAS_MAX_H }: { hit?: number; maxH?: number } = {},
): CanvasFit {
  const pad = canvasPad(hit);
  const availW = Math.max(1, widthPx - pad.left - pad.right);
  const availH = Math.max(1, maxH - pad.top - pad.bottom);
  const scale = Math.min(availW / lengthCm, availH / widthCm);
  const w = lengthCm * scale;
  const h = widthCm * scale;
  return {
    scale,
    w,
    h,
    // a szélesség pontosan a mért (kerekítési hiba nélkül); csak a túl keskeny képnél nagyobb
    viewW: Math.max(widthPx, pad.left + availW + pad.right),
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
 * a sáv adott méretének negyedéig: a sáv közepén mozgatásra szolgáló rész marad. A `2 * hit`-nél
 * keskenyebb irányban befelé egyáltalán nem nyúlnak: ott az egész sáv mozgat, és csak a kifelé
 * nyúló részük méretez (különben ujjal alig maradna megfogható közép).
 */
export function handleZones(r: Rect, hit: number): HandleZone[] {
  const inward = (dim: number) => (dim < 2 * hit ? 0 : Math.min(hit, dim / 4));
  const inX = inward(r.w);
  const inY = inward(r.h);
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

/** Képpont helye (az ágyás bal felső sarkától) tengely- és keresztirányban; a `rectOf` párja. */
export const axesOf = (x: number, y: number, across: boolean): LayoutSize => (across ? { axis: x, cross: y } : { axis: y, cross: x });

/** Benne van-e a pont (cm) a sávban, vagy legfeljebb `tolCm`-re kívüle; az élei is beletartoznak. */
const containsPoint = (p: Placement, pt: LayoutSize, tolCm = 0) =>
  pt.axis >= p.axis_start_cm - tolCm &&
  pt.axis <= p.axis_start_cm + p.axis_span_cm + tolCm &&
  pt.cross >= p.cross_start_cm - tolCm &&
  pt.cross <= p.cross_start_cm + p.cross_span_cm + tolCm;

/** A ponton (cm) álló sáv kulcsa, átfedésnél a később (felülre) rajzolté; `null`, ha ott nincs sáv. */
export function stripAt(strips: LayoutStrip[], pt: LayoutSize): number | null {
  for (let i = strips.length - 1; i >= 0; i--) if (containsPoint(strips[i]!.placement, pt)) return strips[i]!.key;
  return null;
}

/**
 * A kijelölt sáv fogantyúján húzás nélkül véget ért koppintás célja. A fogantyúk kifelé a
 * szomszédra is rányúlnak (ujjal ~22 képpontnyira), ezért a sávon kívüli koppintás az ott álló
 * sávot jelöli ki, üres helyen pedig megszünteti a kijelölést (`null`).
 * `undefined`: a koppintás a kijelölt sávon belül vagy legfeljebb `tolCm`-re kívüle volt (az élre
 * rajzolt pötty fele kilóg a sávból), a kijelölés marad.
 */
export function handleTapTarget(strips: LayoutStrip[], selected: number, pt: LayoutSize, tolCm = 0): number | null | undefined {
  const own = strips.find((x) => x.key === selected);
  if (own && containsPoint(own.placement, pt, tolCm)) return undefined;
  return stripAt(strips, pt);
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

export type DragStep = 'wait' | 'orig' | 'apply';

/**
 * A húzás egy lépése a kezdőponthoz mért elmozdulásból (`dims` irányaiban). Az indítási küszöb
 * (`slop`) első átléptéig koppintásnak számít, nincs változás (`wait`). Utána a holtsávon belül
 * (`deadCm`, a rácsköz fele) a kiinduló kiosztás áll vissza (`orig`), azon túl az elmozdulás
 * érvényes (`apply`): a küszöbnél kisebb, de a holtsávnál nagyobb méretváltozás is elérhető.
 * A hívó a `wait`-től eltérő első lépéstől indultnak tekinti a húzást (`started`).
 */
export function dragStep(started: boolean, delta: LayoutSize, dims: Dim[], slop: number, deadCm = LAYOUT_GRID_CM / 2): DragStep {
  if (!started && !exceeds(delta, dims, slop)) return 'wait';
  return exceeds(delta, dims, deadCm) ? 'apply' : 'orig';
}

/** Ugyanaz-e a két kiosztás (ugyanazok a sávok, ugyanott). */
export function sameStrips(a: LayoutStrip[], b: LayoutStrip[]): boolean {
  return a === b || (a.length === b.length && a.every((x, i) => x.key === b[i]!.key && samePlacement(x.placement, b[i]!.placement)));
}
