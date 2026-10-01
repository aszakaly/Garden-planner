import { describe, expect, it } from 'vitest';
import { companionHits, companionIndex, type Mate } from './companions.ts';
import { placementsAdjacent } from './geometry.ts';

const full = { cross_start_cm: 0, cross_span_cm: 120 };
const strip = (start: number, span: number) => ({ axis_start_cm: start, axis_span_cm: span, ...full });
const period = { start: '2027-05-10', end: '2027-09-01' };
const index = companionIndex([
  { a: 1, b: 2, relation: -1, reason: 'Gátló anyagokat választ ki (allelopátia).' },
  { a: 1, b: 3, relation: 1, reason: 'Riasztja a kártevőket.' },
  { a: 1, b: 4, relation: 0, reason: null },
]);
const mate = (id: number, plant_id: number, plant_name: string, placement: Mate['placement']): Mate => ({
  id, plant_id, plant_name, placement, period,
});

describe('szomszédság', () => {
  it('legfeljebb 10 cm-re lévő sávok szomszédosak', () => {
    expect(placementsAdjacent(strip(0, 80), strip(80, 40))).toBe(true);
    expect(placementsAdjacent(strip(0, 80), strip(90, 40))).toBe(true);
    expect(placementsAdjacent(strip(0, 80), strip(95, 40))).toBe(false);
    expect(
      placementsAdjacent(strip(0, 80), { axis_start_cm: 0, axis_span_cm: 80, cross_start_cm: 140, cross_span_cm: 30 }),
    ).toBe(false);
  });
});

describe('társítás', () => {
  it('paradicsom mellé édeskömény: kerülendő szomszéd; távolabb csak tájékoztatás', () => {
    const near = companionHits({ plant_id: 1, placement: strip(0, 80) }, [mate(10, 2, 'Édeskömény', strip(80, 40))], index);
    expect(near).toEqual([expect.objectContaining({ relation: -1, neighbour: true, level: 'kerulendo' })]);
    const far = companionHits({ plant_id: 1, placement: strip(0, 80) }, [mate(10, 2, 'Édeskömény', strip(300, 40))], index);
    expect(far[0]).toMatchObject({ neighbour: false, level: 'info' });
  });

  it('kedvező és semleges pár; növényenként a legerősebb találat, rendezve', () => {
    const hits = companionHits(
      { plant_id: 1, placement: strip(100, 60) },
      [
        mate(11, 3, 'Bazsalikom', strip(300, 30)),
        mate(12, 3, 'Bazsalikom', strip(160, 30)),
        mate(13, 4, 'Saláta', strip(60, 40)),
        mate(14, 2, 'Édeskömény', null),
      ],
      index,
    );
    expect(hits.map((h) => [h.mate.id, h.level, h.neighbour])).toEqual([
      [14, 'info', false],
      [12, 'ok', true],
    ]);
  });
});
