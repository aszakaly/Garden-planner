import { describe, expect, it } from 'vitest';
import type { LayoutStrip } from '@shared/domain/layout.ts';
import {
  CANVAS_MAX_H,
  CANVAS_PAD,
  axesOf,
  canvasFit,
  canvasMaxH,
  canvasPad,
  dimsOf,
  dragStep,
  exceeds,
  handleTapTarget,
  handleZones,
  rectOf,
  sameStrips,
  slopCm,
  stripAt,
  type Rect,
} from './canvasGeometry.ts';

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

  it('az axesOf a képpont helyét a rectOf irányaiba fordítja vissza', () => {
    const p = placement(40, 30, 10, 60);
    for (const across of [true, false]) {
      const r = rectOf(p, across);
      expect(axesOf(r.x, r.y, across)).toEqual({ axis: 40, cross: 10 });
    }
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

  it('telefonon is egy képpont a kép egysége, a margók teljes méretűek maradnak', () => {
    const f = canvasFit(338, 400, 80);
    expect(f.viewW).toBe(338);
    expect(f.left).toBe(CANVAS_PAD.left);
    expect(f.viewW - f.left - f.w).toBeCloseTo(CANVAS_PAD.right);
    expect(f.top).toBe(CANVAS_PAD.top);
    expect(f.viewH - f.top - f.h).toBeCloseTo(CANVAS_PAD.bottom);
  });

  it('a margó legalább a fogantyúk érintési sávja: ujjal nő, egérrel szinte a régi', () => {
    expect(canvasPad(22)).toEqual({ left: 34, top: 22, right: 22, bottom: 26 });
    expect(canvasPad(11)).toEqual({ left: 34, top: 11, right: 12, bottom: 26 });
    expect(canvasPad()).toEqual(CANVAS_PAD);
    const f = canvasFit(338, 400, 80, { hit: 22 });
    expect(f.top).toBe(22);
    expect(f.viewW - f.left - f.w).toBeCloseTo(22);
  });

  it('bármilyen szélességnél és ágyásnál a kép pontosan a mért szélességű, és nem magasabb a megengedettnél', () => {
    for (const hit of [0, 11, 22])
      for (const maxH of [CANVAS_MAX_H, 165])
        for (const lengthCm of [40, 120, 400, 1000])
          for (const widthCm of [30, 80, 120, 300]) {
            const pad = canvasPad(hit);
            const minW = pad.left + pad.right + 1;
            for (let widthPx = minW; widthPx <= 1400; widthPx += 37) {
              const f = canvasFit(widthPx, lengthCm, widthCm, { hit, maxH });
              const at = `${widthPx} px, ${lengthCm}×${widthCm} cm, hit ${hit}, max ${maxH}`;
              expect(f.viewW, at).toBe(widthPx);
              expect(f.viewH, at).toBeLessThanOrEqual(maxH + 1e-9);
              expect(f.left + f.w, at).toBeLessThanOrEqual(widthPx - pad.right + 1e-9);
              expect(f.w / lengthCm, at).toBeCloseTo(f.h / widthCm);
            }
          }
  });

  it('a margóknál keskenyebb képnél az ágyás 1 képpontos, és a kép kiszélesedik, hogy elférjen', () => {
    const f = canvasFit(20, 400, 80);
    expect(f.w).toBeCloseTo(1);
    expect(f.viewW).toBe(CANVAS_PAD.left + 1 + CANVAS_PAD.right);
    expect(f.left).toBe(CANVAS_PAD.left);
    expect(f.viewH).toBeCloseTo(f.h + CANVAS_PAD.top + CANVAS_PAD.bottom);
  });

  it('a kép legfeljebb az ablak fele magas, ismeretlen ablaknál a beépített korlát', () => {
    expect(canvasMaxH(390)).toBe(195);
    expect(canvasMaxH(1000)).toBe(CANVAS_MAX_H);
    expect(canvasMaxH(null)).toBe(CANVAS_MAX_H);
    expect(canvasMaxH(0)).toBe(CANVAS_MAX_H);
    // fekvő telefonon a négyzetes ágyás képe is kisebb az ablak felénél
    expect(canvasFit(800, 120, 120, { hit: 22, maxH: canvasMaxH(390) }).viewH).toBeCloseTo(195);
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

  it('közepes sávnál befelé legfeljebb a méret negyedéig ér, kifelé teljes szélességben', () => {
    const r = { x: 100, y: 0, w: 60, h: 200 };
    const zones = handleZones(r, 22);
    const left = zones.find((z) => z.id === 'l')!;
    const right = zones.find((z) => z.id === 'r')!;
    expect(left.x).toBe(78);
    expect(left.x + left.w).toBe(115);
    expect(right.x).toBe(145);
    expect(right.x + right.w).toBe(182);
    // a sáv közepe mozgatásra marad
    expect(inside(zones, 130, 100)).toBe(false);
  });

  it('a `2 * hit`-nél keskenyebb irányban befelé nem nyúlik: az egész sáv mozgat', () => {
    const r = { x: 100, y: 0, w: 40, h: 200 };
    const zones = handleZones(r, 22);
    const left = zones.find((z) => z.id === 'l')!;
    const right = zones.find((z) => z.id === 'r')!;
    expect(left.x).toBe(78);
    expect(left.x + left.w).toBe(100);
    expect(right.x).toBe(140);
    expect(right.x + right.w).toBe(162);
    // a sáv teljes szélessége mozgat (a felső és alsó él a szélesebb irányban marad befelé is)
    for (const x of [101, 120, 139]) expect(inside(zones, x, 100), `${x}`).toBe(false);
    expect(inside(zones, 120, 10)).toBe(true);
    // egérrel (hit 11) ugyanez a sáv már befelé is méretezhető
    expect(handleZones(r, 11).find((z) => z.id === 'l')!.w).toBe(21);
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

describe('koppintás a fogantyún', () => {
  const strips: LayoutStrip[] = [
    { key: 1, placement: placement(0, 30) },
    { key: 2, placement: placement(30, 40) },
    { key: 3, placement: placement(70, 50, 0, 40) },
  ];

  it('a ponton álló sávot adja, üres helyen és az ágyáson kívül semmit', () => {
    expect(stripAt(strips, { axis: 10, cross: 40 })).toBe(1);
    expect(stripAt(strips, { axis: 50, cross: 79 })).toBe(2);
    expect(stripAt(strips, { axis: 90, cross: 60 })).toBe(null);
    expect(stripAt(strips, { axis: -5, cross: 40 })).toBe(null);
  });

  it('átfedésnél a felülre rajzolt (későbbi) sáv', () => {
    expect(stripAt([...strips, { key: 4, placement: placement(20, 20) }], { axis: 25, cross: 10 })).toBe(4);
  });

  it('a kijelölt sávon kívül a szomszédot jelöli ki, üres helyen megszünteti a kijelölést', () => {
    // a 2. sáv kijelölt; a bal fogantyú kifelé a 1. sávra nyúlik
    expect(handleTapTarget(strips, 2, { axis: 26, cross: 40 })).toBe(1);
    expect(handleTapTarget(strips, 2, { axis: 74, cross: 20 })).toBe(3);
    expect(handleTapTarget(strips, 3, { axis: 90, cross: 45 })).toBe(null);
  });

  it('a kijelölt sávon belül (az élén is) a kijelölés marad', () => {
    expect(handleTapTarget(strips, 2, { axis: 32, cross: 40 })).toBeUndefined();
    expect(handleTapTarget(strips, 2, { axis: 30, cross: 40 })).toBeUndefined();
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

describe('dragStep', () => {
  /** Egy húzás lépései egymás után, a `started` reteszeléssel együtt (ahogy a LayoutCanvas hívja). */
  const run = (axisDeltas: number[], slop: number) => {
    let started = false;
    return axisDeltas.map((axis) => {
      const step = dragStep(started, { axis, cross: 0 }, ['axis'], slop);
      if (step !== 'wait') started = true;
      return step;
    });
  };

  it('a küszöbön belüli remegés (koppintás) soha nem módosít', () => {
    expect(run([1, -3, 4.9, 2, 0], 5)).toEqual(['wait', 'wait', 'wait', 'wait', 'wait']);
  });

  it('a küszöb átlépése után a holtsávba visszatérve a kiinduló állapot áll vissza', () => {
    expect(run([3, 6, 1, -2, 0], 5)).toEqual(['wait', 'apply', 'orig', 'orig', 'orig']);
  });

  it('a nagy (kis nagyítás miatti) küszöb után az 5 cm-es változás is elérhető', () => {
    expect(run([10, 16, 5, -5, 2], 16)).toEqual(['wait', 'apply', 'apply', 'apply', 'orig']);
  });

  it('csak a húzott irány számít; mozgatásnál bármelyik', () => {
    expect(dragStep(false, { axis: 1, cross: 20 }, ['axis'], 5)).toBe('wait');
    expect(dragStep(false, { axis: 1, cross: 20 }, ['axis', 'cross'], 5)).toBe('apply');
    expect(dragStep(true, { axis: 1, cross: 20 }, ['axis'], 5)).toBe('orig');
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
