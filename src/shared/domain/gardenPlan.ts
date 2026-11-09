// A kert alaprajzának tiszta logikája: ágyások helye a kertben, forgatás, ütközés, illesztés.
// Koordináták: a kert bal felső sarka az origó, `x` a kert hossza, `y` a mélysége mentén.
// Az ágyás helye a (forgatás utáni) befoglaló téglalap bal felső sarka.

/** Az alaprajz illesztési lépése (cm). */
export const GRID_CM = 10;

export type Rotation = 0 | 90;

export interface PlanBed {
  id: number;
  name: string;
  length_cm: number;
  width_cm: number;
  pos_x_cm: number | null;
  pos_y_cm: number | null;
  rotation_deg: number;
}

export interface GardenSize {
  length_cm: number;
  width_cm: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 0°-nál az ágyás hossza vízszintes (a kert hossza mentén), 90°-nál függőleges. */
export function footprint(b: Pick<PlanBed, 'length_cm' | 'width_cm' | 'rotation_deg'>): { w: number; h: number } {
  return b.rotation_deg === 90 ? { w: b.width_cm, h: b.length_cm } : { w: b.length_cm, h: b.width_cm };
}

/** Az elhelyezett ágyás téglalapja; elhelyezetlennél `null`. */
export function bedRect(b: PlanBed): Rect | null {
  if (b.pos_x_cm == null || b.pos_y_cm == null) return null;
  return { x: b.pos_x_cm, y: b.pos_y_cm, ...footprint(b) };
}

/** Átfedés; az érintkező (közös élű) téglalapok nem fednek át. */
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const insideGarden = (r: Rect, g: GardenSize) => r.x >= 0 && r.y >= 0 && r.x + r.w <= g.length_cm && r.y + r.h <= g.width_cm;

export const snap = (v: number, step = GRID_CM) => Math.round(v / step) * step;

/** Az ágyás a kertbe szorítva, a rácshoz illesztve. */
export function snapInto(x: number, y: number, size: { w: number; h: number }, g: GardenSize): { x: number; y: number } {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(max, 0));
  // A rácsra illesztés után is a kertben maradjon (a kert mérete nem feltétlenül rácsméret).
  return {
    x: clamp(snap(x), Math.floor((g.length_cm - size.w) / GRID_CM) * GRID_CM),
    y: clamp(snap(y), Math.floor((g.width_cm - size.h) / GRID_CM) * GRID_CM),
  };
}

/** Az elhelyezés hibája, magyar üzenettel; `null`, ha szabad a hely. */
export function placementError(rect: Rect, self: number, others: PlanBed[], g: GardenSize): string | null {
  if (!insideGarden(rect, g)) return 'Az ágyás kilógna a kertből.';
  const hit = others.find((o) => {
    if (o.id === self) return false;
    const r = bedRect(o);
    return r != null && overlaps(rect, r);
  });
  return hit ? `Az ágyás átfedné ezt: ${hit.name}.` : null;
}

/** Az egész alaprajz hibái: kilógó és egymást átfedő ágyások. Üres lista, ha rendben van. */
export function planErrors(beds: PlanBed[], g: GardenSize): string[] {
  const errors: string[] = [];
  const placed = beds.map((b) => ({ b, r: bedRect(b) })).filter((p): p is { b: PlanBed; r: Rect } => p.r != null);
  for (const { b, r } of placed) if (!insideGarden(r, g)) errors.push(`${b.name} kilóg a kertből.`);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (overlaps(placed[i]!.r, placed[j]!.r)) errors.push(`${placed[i]!.b.name} és ${placed[j]!.b.name} átfedi egymást.`);
    }
  }
  return errors;
}

/** Elforgatás a befoglaló téglalap bal felső sarka körül; hibaüzenet, ha úgy nem fér el. */
export function rotate(b: PlanBed, others: PlanBed[], g: GardenSize): { bed: PlanBed } | { error: string } {
  const next: PlanBed = { ...b, rotation_deg: b.rotation_deg === 90 ? 0 : 90 };
  const r = bedRect(next);
  if (!r) return { bed: next };
  const err = placementError(r, b.id, others, g);
  return err ? { error: `Elforgatva nem fér el: ${err.charAt(0).toLowerCase()}${err.slice(1)}` } : { bed: next };
}

export interface Gaps {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * A négy irányban a szabad távolság a legközelebbi szomszédig vagy a kert széléig.
 * Szomszédnak az számít, amelyik az adott irányban a téglalap sávjába esik.
 */
export function gaps(rect: Rect, self: number, others: PlanBed[], g: GardenSize): Gaps {
  const res: Gaps = { left: rect.x, right: g.length_cm - rect.x - rect.w, top: rect.y, bottom: g.width_cm - rect.y - rect.h };
  for (const o of others) {
    if (o.id === self) continue;
    const r = bedRect(o);
    if (!r) continue;
    const rowOverlap = r.y < rect.y + rect.h && rect.y < r.y + r.h;
    const colOverlap = r.x < rect.x + rect.w && rect.x < r.x + r.w;
    if (rowOverlap && r.x + r.w <= rect.x) res.left = Math.min(res.left, rect.x - r.x - r.w);
    if (rowOverlap && r.x >= rect.x + rect.w) res.right = Math.min(res.right, r.x - rect.x - rect.w);
    if (colOverlap && r.y + r.h <= rect.y) res.top = Math.min(res.top, rect.y - r.y - r.h);
    if (colOverlap && r.y >= rect.y + rect.h) res.bottom = Math.min(res.bottom, r.y - rect.y - rect.h);
  }
  return res;
}

/** Archív az ágyás, ha a használata az adott év előtt véget ért: nem látszik, és nem foglal helyet. */
export const isArchived = (b: { active_to_year: number | null }, year: number) => b.active_to_year != null && b.active_to_year < year;
