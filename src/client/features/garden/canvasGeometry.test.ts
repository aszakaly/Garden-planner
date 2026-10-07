import { describe, expect, it } from 'vitest';
import type { LayoutStrip } from '@shared/domain/layout.ts';
import { CANVAS_MAX_H, CANVAS_PAD, canvasFit, dimsOf, exceeds, handleZones, rectOf, sameStrips, slopCm, type Rect } from './canvasGeometry.ts';

const placement = (axis: number, axisSpan: number, cross = 0, crossSpan = 80) => ({
  axis_start_cm: axis,
  axis_span_cm: axisSpan,
  cross_start_cm: cross,
  cross_span_cm: crossSpan,
});

describe('rectOf', () => {
  it('keresztben futó soroknál a tengely vízszintes, hosszában futóknál függőleges', () => {
    const p = placement(40, 30, 10, 60);
    expect(rectOf(p, true, 2)).toEqual({ x: 80, y: 20, w: 60, h: 120 });
    expect(rectOf(p, false)).toEqual({ x: 10, y: 40, w: 60, h: 30 });
  });
});

describe('canvasFit', () => {
  const padX = CANVAS_PAD.left + CANVAS_PAD.right;
  const padY = CANVAS_PAD.top + CANVAS_PAD.bottom;

  it('asztalon a hosszú ágyás kitölti a szélességet', () => {
    const f = canvasFit(848, 400, 80);
    expect(f.scale).toBeCloseTo((848 - padX) / 400);
    expect(f.viewW).toBe(848);
    expect(f.viewH).toBeCloseTo(80 * f.scale + padY);
    expect(f.left).toBe(CANVAS_PAD.left);
  });

  it('telefonon is képpont a kép egysége: a margók nem zsugorodnak', () => {
    const f = canvasFit(338, 400, 80);
    expect(f.w + padX).toBeCloseTo(338);
    expect(f.viewW).toBe(338);
  });

  it('a magas ágyásnál a magasság korlátoz, és az ágyás vízszintesen középre kerül', () => {
    const f = canvasFit(848, 120, 120);
    expect(f.viewH).toBeCloseTo(CANVAS_MAX_H);
    expect(f.w).toBeCloseTo(CANVAS_MAX_H - padY);
    expect(f.left + f.w / 2).toBeCloseTo(CANVAS_PAD.left + (848 - padX) / 2);
  });
});

describe('handleZones', () => {
  const contains = (z: Rect, x: number, y: number) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  const inside = (zones: Rect[], x: number, y: number) => zones.some((z) => contains(z, x, y));

  it('széles sávnál a zóna mindkét irányban `hit`-nyire nyúlik az éltől', () => {
    const zones = handleZones({ x: 100, y: 0, w: 200, h: 100 }, 11);
    const left = zones.find((z) => z.id === 'l')!;
    expect(left.x).toBe(89);
    expect(left.w).toBe(22);
    expect(zones.map((z) => z.id)).toEqual(['l', 'r', 't', 'b', 'lt', 'rt', 'lb', 'rb']);
  });

  it('keskeny sávnál befelé legfeljebb a méret negyedéig ér, kifelé teljes szélességben', () => {
    const r = { x: 100, y: 0, w: 16, h: 200 };
    const zones = handleZones(r, 22);
    const left = zones.find((z) => z.id === 'l')!;
    const right = zones.find((z) => z.id === 'r')!;
    expect(left.x).toBe(78);
    expect(left.x + left.w).toBe(104);
    expect(right.x).toBe(112);
    expect(right.x + right.w).toBe(138);
    // a sáv közepe mozgatásra marad
    expect(inside(zones, 108, 100)).toBe(false);
  });

  it('a sarkok és az élek nem fedik át egymást', () => {
    const zones = handleZones({ x: 0, y: 0, w: 20, h: 12 }, 22);
    for (const a of zones)
      for (const b of zones) {
        if (a === b) continue;
        const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapW > 1e-9 && overlapH > 1e-9, `${a.id}–${b.id}`).toBe(false);
      }
    expect(inside(zones, 10, 6)).toBe(false);
  });
});

describe('húzási küszöb', () => {
  it('az él csak a saját irányában számít, mozgatásnál mindkét irány', () => {
    expect(dimsOf(['axisEnd'])).toEqual(['axis']);
    expect(dimsOf(['crossStart', 'axisStart'])).toEqual(['cross', 'axis']);
    expect(dimsOf(null)).toEqual(['axis', 'cross']);
  });

  it('a keresztirányú remegés nem indítja el a tengely menti méretezést', () => {
    const delta = { axis: 1, cross: 10 };
    expect(exceeds(delta, dimsOf(['axisEnd']), 2.5)).toBe(false);
    expect(exceeds(delta, dimsOf(null), 2.5)).toBe(true);
    expect(exceeds({ axis: -2.5, cross: 0 }, ['axis'], 2.5)).toBe(true);
  });

  it('a küszöb legalább a rácsköz fele, kis nagyításnál a képpontos küszöb', () => {
    expect(slopCm(3, 2)).toBe(2.5);
    expect(slopCm(8, 0.5)).toBe(16);
  });
});

describe('sameStrips', () => {
  const a: LayoutStrip[] = [
    { key: 1, placement: placement(0, 30) },
    { key: 2, placement: placement(30, 40) },
  ];

  it('azonos helyen álló sávok: nincs változás', () => {
    expect(sameStrips(a, a.map((x) => ({ ...x, placement: { ...x.placement } })))).toBe(true);
  });

  it('elmozdult vagy más sáv: változás', () => {
    expect(sameStrips(a, [a[0]!, { key: 2, placement: placement(35, 40) }])).toBe(false);
    expect(sameStrips(a, [a[0]!, { key: 3, placement: placement(30, 40) }])).toBe(false);
    expect(sameStrips(a, [a[0]!])).toBe(false);
  });
});
