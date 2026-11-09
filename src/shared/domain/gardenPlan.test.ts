import { describe, expect, it } from 'vitest';
import { bedRect, footprint, gaps, isArchived, placementError, planErrors, rotate, snapInto, type PlanBed } from './gardenPlan.ts';

const garden = { length_cm: 1150, width_cm: 550 };
const bed = (id: number, x: number | null, y: number | null, rotation_deg = 0): PlanBed => ({
  id, name: `Ágyás ${id}`, length_cm: 200, width_cm: 80, pos_x_cm: x, pos_y_cm: y, rotation_deg,
});

describe('kert alaprajza', () => {
  it('90°-nál az ágyás hossza függőleges', () => {
    expect(footprint(bed(1, 0, 0))).toEqual({ w: 200, h: 80 });
    expect(footprint(bed(1, 0, 0, 90))).toEqual({ w: 80, h: 200 });
    expect(bedRect(bed(1, null, 0))).toBeNull();
  });

  it('a rácshoz illeszt, és a kertben tartja', () => {
    expect(snapInto(34, 66, { w: 80, h: 200 }, garden)).toEqual({ x: 30, y: 70 });
    expect(snapInto(-50, 999, { w: 80, h: 200 }, garden)).toEqual({ x: 0, y: 350 });
    // 555 cm mély kertben a 200 cm-es ágyás alja legfeljebb 550-nél lehet a rácson
    expect(snapInto(0, 999, { w: 80, h: 200 }, { length_cm: 1150, width_cm: 555 })).toEqual({ x: 0, y: 350 });
  });

  it('az érintkezés még nem átfedés, a kilógás és az átfedés hiba', () => {
    const others = [bed(2, 120, 0, 90)];
    expect(placementError({ x: 40, y: 0, w: 80, h: 200 }, 1, others, garden)).toBeNull();
    expect(placementError({ x: 50, y: 0, w: 80, h: 200 }, 1, others, garden)).toBe('Az ágyás átfedné ezt: Ágyás 2.');
    expect(placementError({ x: 1100, y: 0, w: 80, h: 200 }, 1, others, garden)).toBe('Az ágyás kilógna a kertből.');
    // saját magával nem ütközik
    expect(placementError({ x: 120, y: 0, w: 80, h: 200 }, 2, others, garden)).toBeNull();
  });

  it('elforgatva csak akkor fordul, ha elfér', () => {
    const others = [bed(2, 0, 100)];
    const r = rotate(bed(1, 0, 0), others, garden);
    expect(r).toEqual({ error: 'Elforgatva nem fér el: az ágyás átfedné ezt: Ágyás 2.' });
    expect(rotate(bed(1, 300, 0), others, garden)).toEqual({ bed: bed(1, 300, 0, 90) });
  });

  it('a távolság a legközelebbi szomszédig vagy a kert széléig', () => {
    const others = [bed(2, 0, 0, 90), bed(3, 400, 0, 90), bed(4, 150, 300)];
    // 80 cm széles ágyás 120-nál, bal szomszéd 0–80, jobb 400-tól, alatta 300-tól
    expect(gaps({ x: 120, y: 0, w: 80, h: 200 }, 1, others, garden)).toEqual({ left: 40, right: 200, top: 0, bottom: 100 });
  });

  it('az alaprajz hibái megnevezik az ágyásokat', () => {
    expect(planErrors([bed(1, 0, 0), bed(2, 100, 40), bed(3, 1000, 0), bed(4, null, null)], garden)).toEqual([
      'Ágyás 3 kilóg a kertből.',
      'Ágyás 1 és Ágyás 2 átfedi egymást.',
    ]);
  });

  it('az az ágyás archív, amelynek a használata az év előtt véget ért', () => {
    expect(isArchived({ active_to_year: 2025 }, 2026)).toBe(true);
    expect(isArchived({ active_to_year: 2026 }, 2026)).toBe(false);
    expect(isArchived({ active_to_year: null }, 2026)).toBe(false);
  });
});
