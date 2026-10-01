import type { CheckLevel } from '../labels.ts';
import { placementsAdjacent, type Period, type Placement } from './geometry.ts';

export interface CompanionPair {
  a: number;
  b: number;
  relation: -1 | 0 | 1;
  reason: string | null;
}

export type CompanionIndex = Map<string, { relation: -1 | 0 | 1; reason: string | null }>;

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function companionIndex(pairs: CompanionPair[]): CompanionIndex {
  return new Map(pairs.map((p) => [pairKey(p.a, p.b), { relation: p.relation, reason: p.reason }]));
}

export const relationOf = (index: CompanionIndex, a: number, b: number) => index.get(pairKey(a, b));

/** Egy időben ugyanabban az ágyásban álló másik ültetés. */
export interface Mate {
  id: number;
  plant_id: number;
  plant_name: string;
  /** null: az ágyáson belül nincs kijelölt helye */
  placement: Placement | null;
  period: Period;
}

export interface CompanionHit {
  mate: Mate;
  relation: -1 | 1;
  reason: string | null;
  /** Közvetlen szomszéd (≤ 10 cm) – egyébként csak ugyanabban az ágyásban áll */
  neighbour: boolean;
  /** 'ok': kedvező; kerülendő párnál szomszédként 'kerulendo', távolabbi ágyástársként csak 'info' */
  level: CheckLevel | 'ok';
}

const rank = (h: CompanionHit) => (h.relation === -1 ? 0 : 2) + (h.neighbour ? 0 : 1);

/**
 * Társítás-ellenőrzés: az időben átfedő ágyástársak kapcsolata a társítási adatok alapján.
 * A közvetlen szomszédok erősebb súllyal számítanak. Növényenként a legerősebb találat marad meg.
 */
export function companionHits(
  crop: { plant_id: number; placement: Placement | null },
  mates: Mate[],
  index: CompanionIndex,
): CompanionHit[] {
  const best = new Map<number, CompanionHit>();
  for (const mate of mates) {
    if (mate.plant_id === crop.plant_id) continue;
    const rel = relationOf(index, crop.plant_id, mate.plant_id);
    if (!rel || rel.relation === 0) continue;
    const neighbour = !!crop.placement && !!mate.placement && placementsAdjacent(crop.placement, mate.placement);
    const hit: CompanionHit = {
      mate,
      relation: rel.relation,
      reason: rel.reason,
      neighbour,
      level: rel.relation === 1 ? 'ok' : neighbour ? 'kerulendo' : 'info',
    };
    const prev = best.get(mate.plant_id);
    if (!prev || rank(hit) < rank(prev)) best.set(mate.plant_id, hit);
  }
  return [...best.values()].sort((a, b) => rank(a) - rank(b) || a.mate.plant_name.localeCompare(b.mate.plant_name, 'hu'));
}
