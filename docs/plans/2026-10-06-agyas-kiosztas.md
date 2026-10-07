# Ágyás kiosztása – megvalósítási terv

> **Megjegyzés (2026-10-07):** a megvalósítás a kódátnézések és a kézi próba alapján több ponton eltér az itteni kódtól (pl. sorszám-alap a piszkozatban, arányos helycsinálás, a választott napon szabad hely az elővetemény felvételéhez); a mérvadó a kód.

> **Végrehajtóknak:** KÖTELEZŐ al-skill: superpowers:subagent-driven-development (ajánlott) vagy superpowers:executing-plans. A lépések jelölőnégyzetesek (`- [ ]`).

**Cél:** az ágyás sorai vizuálisan, húzással és méretezéssel állíthatók össze (pl. paradicsom–bazsalikom–paradicsom), elő-, fő- és utóvetemény szerint; a követelmények a [design dokumentum](../specs/2026-09-30-kerttervezo-design.md) „Ágyás kiosztása (2026-10-06)” szakaszában vannak.

**Felépítés:** a geometriai és döntési logika tiszta függvényként a `src/shared/domain/layout.ts`-be kerül (egységtesztekkel). A kliens a `features/garden/` alatt egy piszkozatot (`layoutDraft.ts`) szerkeszt, amelyet a „Kész” egyetlen `POST /api/plantings/batch` kéréssel, egy tranzakcióban ment. Adatbázis-módosítás nincs.

**Technológia:** TypeScript, React 19, TanStack Query, Fastify, `node:sqlite`, zod, Vitest, Playwright.

**Szabályok a végrehajtáshoz:**
- Branch: `agyas-kiosztas`. Minden lépés végén commit, magyar üzenettel, a végén `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Minden szöveg magyar (felület, hibaüzenet, komment, tesztnév).
- A `data/garden.db`-be és a `data/sandbox.db`-be nem írunk; kipróbálás csak a `kerttervezo-uitest` példányon (`.claude/launch.json`).
- A koordináták a `geometry.ts` szerintiek: **tengely** = ahogy a sorok egymást követik; **keresztirány** = egy sor hossza. Keresztben futó soroknál a tengely az ágyás hossza, hosszában futóknál a szélessége.

---

## Fájlok

| Fájl | Feladat |
|---|---|
| `src/shared/labels.ts` (mód.) | `LAYOUT_PHASES`, `LAYOUT_PHASE_LABEL` |
| `src/shared/domain/layout.ts` (új) | sávműveletek: méretezés engedéssel, mozgatás és csere, szétvágás, sorok, határok, új sáv helye, időpontok, ablakválasztás, kapcsolt ültetések, ütközésjavítás |
| `src/shared/domain/layout.test.ts` (új) | egységtesztek |
| `src/shared/schemas.ts` (mód.) | `plantingBatchInput` |
| `src/server/repos/plantings.ts` (mód.) | tranzakció nélküli belső függvények, `savePlantingBatch` |
| `src/server/routes/plan.ts` (mód.) | `POST /plantings/batch` |
| `src/server/plan.test.ts` (mód.) | API-tesztek |
| `src/client/features/plan/plantingView.ts` (mód.) | `plantingInputOf` |
| `src/client/features/garden/layoutDraft.ts` (új) | a szerkesztő piszkozata |
| `src/client/features/garden/layoutDraft.test.ts` (új) | egységtesztek |
| `src/client/components/ui/Sheet.tsx`, `.module.css` (mód.) | `wide` változat |
| `src/client/features/garden/BedLayout.module.css` (új) | a szerkesztő stílusai |
| `src/client/features/garden/LayoutCanvas.tsx` (új) | húzható ágyáskép |
| `src/client/features/garden/LayoutRowList.tsx` (új) | sávlista |
| `src/client/features/garden/LayoutPhasePicker.tsx` (új) | elő-, fő-, utóvetemény választó |
| `src/client/features/garden/BedLayoutSheet.tsx` (új) | a „Kiosztás” lap |
| `src/client/features/garden/BedPage.tsx` (mód.) | „Kiosztás” gomb |
| `src/client/features/plan/PlantingEditSheet.tsx` (mód.) | „Kapcsolt sávokon is” kapcsoló |
| `e2e/garden-flow.spec.ts` (mód.) | 12. lépés |
| `CHANGELOG.md`, `CLAUDE.md` (mód.) | dokumentáció |

---

### 1. lépés: sávműveletek a domainben

> A kódátnézés után javítva (9dc652a: húzás megállása az akadálynál, zsugorítás szélesebb szomszéd mellett, sarokfogantyú, sorléptető, régi adatok). A végleges kód a repóban van; az alábbi a kiinduló változat.

**Fájlok:**
- Létrehozás: `src/shared/domain/layout.ts`
- Teszt: `src/shared/domain/layout.test.ts`

- [ ] **1.1 A hibás teszt megírása** – `src/shared/domain/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  boundaries,
  layoutRows,
  moveRow,
  moveStrip,
  resizeRow,
  resizeStrip,
  rowsReorderable,
  splitStrip,
  type LayoutStrip,
} from './layout.ts';

// 200 × 80 cm-es ágyás, hosszában futó sorokkal: a tengely a 80 cm-es szélesség
const size = { axis: 80, cross: 200 };
const strip = (key: number, axis: number, span: number, cross = 0, crossSpan = 200, fixed = false): LayoutStrip => ({
  key,
  fixed,
  placement: { axis_start_cm: axis, axis_span_cm: span, cross_start_cm: cross, cross_span_cm: crossSpan },
});
const at = (strips: LayoutStrip[] | null, key: number) => strips!.find((s) => s.key === key)!.placement;
// paradicsom 0–30, bazsalikom 30–50, paradicsom 50–80
const three = () => [strip(1, 0, 30), strip(2, 30, 20), strip(3, 50, 30)];

describe('méretezés', () => {
  it('a húzott él a rácsra ugrik, és az érintkező szomszéd enged', () => {
    const out = resizeStrip(three(), 2, ['axisEnd'], { axis: 12, cross: 0 }, size);
    expect(at(out, 2)).toMatchObject({ axis_start_cm: 30, axis_span_cm: 30 });
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 60, axis_span_cm: 20 });
  });

  it('visszafelé húzva a szomszéd követi', () => {
    const out = resizeStrip(three(), 2, ['axisEnd'], { axis: -7, cross: 0 }, size);
    expect(at(out, 2).axis_span_cm).toBe(15);
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 45, axis_span_cm: 35 });
  });

  it('a szomszéd legfeljebb 10 cm-ig keskenyedik', () => {
    const out = resizeStrip(three(), 2, ['axisEnd'], { axis: 40, cross: 0 }, size);
    expect(at(out, 2).axis_span_cm).toBe(40);
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 70, axis_span_cm: 10 });
  });

  it('rögzített szomszéd nem enged', () => {
    const strips = [strip(1, 0, 30), strip(2, 30, 20), strip(3, 50, 30, 0, 200, true)];
    const out = resizeStrip(strips, 2, ['axisEnd'], { axis: 10, cross: 0 }, size);
    expect(at(out, 2).axis_span_cm).toBe(20);
    expect(at(out, 3).axis_start_cm).toBe(50);
  });

  it('rögzített sáv nem méretezhető', () => {
    expect(resizeStrip([strip(1, 0, 30, 0, 200, true)], 1, ['axisEnd'], { axis: 10, cross: 0 }, size)).toBeNull();
  });

  it('a sarok mindkét irányt állítja', () => {
    const out = resizeStrip([strip(1, 0, 30, 0, 100)], 1, ['axisEnd', 'crossEnd'], { axis: 10, cross: 50 }, size);
    expect(at(out, 1)).toEqual({ axis_start_cm: 0, axis_span_cm: 40, cross_start_cm: 0, cross_span_cm: 150 });
  });

  it('a részben érintkező szomszédok is engednek', () => {
    const strips = [strip(1, 0, 30), strip(2, 30, 20, 0, 100), strip(3, 30, 20, 100, 100)];
    const out = resizeStrip(strips, 1, ['axisEnd'], { axis: 10, cross: 0 }, size);
    expect(at(out, 1).axis_span_cm).toBe(40);
    expect(at(out, 2)).toMatchObject({ axis_start_cm: 40, axis_span_cm: 10 });
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 40, axis_span_cm: 10 });
  });
});

describe('mozgatás', () => {
  it('a szomszéd közepén túlra húzva helyet cserélnek', () => {
    const out = moveStrip(three(), 2, { axis: -30, cross: 0 }, size);
    expect(at(out, 2)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 20 });
    expect(at(out, 1)).toMatchObject({ axis_start_cm: 20, axis_span_cm: 30 });
    expect(at(out, 3).axis_start_cm).toBe(50);
  });

  it('a közepéig nem cserél, és átfedő helyre nem mozdul', () => {
    const out = moveStrip(three(), 2, { axis: -20, cross: 0 }, size);
    expect(at(out, 2).axis_start_cm).toBe(30);
  });

  it('szabad helyre mozgatható', () => {
    const out = moveStrip([strip(1, 0, 30), strip(2, 40, 20)], 2, { axis: 12, cross: 0 }, size);
    expect(at(out, 2).axis_start_cm).toBe(50);
  });

  it('foglalt helyre nem mozdul', () => {
    const out = moveStrip([strip(1, 0, 30), strip(2, 40, 20)], 2, { axis: -15, cross: 0 }, size);
    expect(at(out, 2).axis_start_cm).toBe(40);
  });
});

describe('szétvágás', () => {
  it('a sor hossza mentén felezi, a második fél az új kulcsot kapja', () => {
    const out = splitStrip([strip(1, 0, 30)], 1, -1);
    expect(at(out, 1)).toMatchObject({ cross_start_cm: 0, cross_span_cm: 100 });
    expect(at(out, -1)).toEqual({ axis_start_cm: 0, axis_span_cm: 30, cross_start_cm: 100, cross_span_cm: 100 });
  });

  it('20 cm-nél rövidebb sáv nem vágható', () => {
    expect(splitStrip([strip(1, 0, 30, 0, 15)], 1, -1)).toBeNull();
  });
});

describe('sorok', () => {
  const strips = () => [strip(1, 0, 30), strip(2, 30, 20, 0, 100), strip(4, 30, 20, 100, 100), strip(3, 50, 30)];

  it('az azonos tengelyszakaszon állók egy sorba kerülnek', () => {
    expect(layoutRows(strips())).toEqual([
      { start: 0, span: 30, keys: [1] },
      { start: 30, span: 20, keys: [2, 4] },
      { start: 50, span: 30, keys: [3] },
    ]);
  });

  it('egész sor áthelyezhető', () => {
    const s = strips();
    const out = moveRow(s, layoutRows(s), 2, 0);
    expect(at(out, 3).axis_start_cm).toBe(0);
    expect(at(out, 1).axis_start_cm).toBe(30);
    expect(at(out, 2).axis_start_cm).toBe(60);
    expect(at(out, 4).axis_start_cm).toBe(60);
  });

  it('a sorok közötti hézag a helyén marad', () => {
    const s = [strip(1, 0, 30), strip(3, 40, 30)];
    const out = moveRow(s, layoutRows(s), 1, 0);
    expect(at(out, 3).axis_start_cm).toBe(0);
    expect(at(out, 1).axis_start_cm).toBe(40);
  });

  it('részben átfedő sorok nem rendezhetők át', () => {
    const s = [strip(1, 0, 30, 0, 100), strip(2, 20, 30, 100, 100)];
    expect(rowsReorderable(layoutRows(s))).toBe(false);
    expect(moveRow(s, layoutRows(s), 1, 0)).toBeNull();
  });

  it('a léptető a sor végét mozgatja, a szomszéd enged', () => {
    const s = three();
    const out = resizeRow(s, layoutRows(s)[1]!, 5, size);
    expect(at(out, 2).axis_span_cm).toBe(25);
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 55, axis_span_cm: 25 });
  });

  it('az ágyás szélén a sor eleje mozdul', () => {
    const s = three();
    const out = resizeRow(s, layoutRows(s)[2]!, 5, size);
    expect(at(out, 3)).toMatchObject({ axis_start_cm: 45, axis_span_cm: 35 });
    expect(at(out, 2).axis_span_cm).toBe(15);
  });
});

describe('határok', () => {
  it('az érintkező sávpárok közös határa', () => {
    expect(boundaries(three())).toEqual([
      { a: 1, b: 2, dim: 'axis', at: 30, from: 0, to: 200 },
      { a: 2, b: 3, dim: 'axis', at: 50, from: 0, to: 200 },
    ]);
  });
});
```

- [ ] **1.2 Futtatás, hogy lássuk a hibát**

Parancs: `npx vitest run src/shared/domain/layout.test.ts`
Várt: FAIL, „Failed to resolve import "./layout.ts"”.

- [ ] **1.3 A megvalósítás** – `src/shared/domain/layout.ts`:

```ts
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
```

- [ ] **1.4 Futtatás, hogy átmenjen**

Parancs: `npx vitest run src/shared/domain/layout.test.ts`
Várt: PASS (20 teszt).

- [ ] **1.5 Commit**

```bash
git add src/shared/domain/layout.ts src/shared/domain/layout.test.ts
git commit -m "Kiosztás: sávműveletek a domainben (méretezés engedéssel, csere, szétvágás, sorok)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### 2. lépés: új sáv, időpontok, ablakválasztás, kapcsolt ültetések, ütközésjavítás

**Fájlok:**
- Módosítás: `src/shared/labels.ts` (a fájl végére)
- Módosítás: `src/shared/domain/layout.ts`
- Teszt: `src/shared/domain/layout.test.ts`

- [ ] **2.1 A hibás tesztek** – a `layout.test.ts` importjai ezekre cserélődnek:

```ts
import { describe, expect, it } from 'vitest';
import type { CropTiming } from './dates.ts';
import { blankPlanting } from './plantings.ts';
import type { GrowingWindow, PlantingListItem } from '../types.ts';
import {
  boundaries,
  clashFixes,
  layoutRows,
  linkedPlantings,
  makeRoom,
  moveRow,
  moveStrip,
  phaseDays,
  pickWindowForDay,
  placeInFree,
  resizeRow,
  resizeStrip,
  rowsReorderable,
  splitStrip,
  type LayoutStrip,
} from './layout.ts';
```

A fájl végére:

```ts
describe('új sáv helye', () => {
  it('az első szabad szakasz, ahová befér', () => {
    expect(placeInFree([[0, 20], [50, 80]], 30, 200)).toEqual({ axis_start_cm: 50, axis_span_cm: 30, cross_start_cm: 0, cross_span_cm: 200 });
  });

  it('ha sehová nem fér be, a legnagyobb szabad szakasz (kitöltve)', () => {
    expect(placeInFree([[0, 20], [60, 72]], 30, 200)).toMatchObject({ axis_start_cm: 0, axis_span_cm: 20 });
    expect(placeInFree([[0, 5]], 30, 200)).toBeNull();
  });

  it('hely híján a cél sáv enged az új sávnak', () => {
    const room = makeRoom(three(), 3, 30);
    expect(at(room!.strips, 3)).toMatchObject({ axis_start_cm: 50, axis_span_cm: 10 });
    expect(room!.placement).toEqual({ axis_start_cm: 60, axis_span_cm: 20, cross_start_cm: 0, cross_span_cm: 200 });
    expect(makeRoom([strip(1, 0, 15)], 1, 30)).toBeNull();
  });
});

describe('időpontok és vetési ablak', () => {
  const frost = { lastFrost: '05-10', firstFrost: '10-20' };
  const win = (id: number, method: GrowingWindow['method'], w: Partial<GrowingWindow>): GrowingWindow => ({
    id, plant_id: 1, variety_id: null, season: 'tavaszi', method, sow_start: null, sow_end: null, seedling_weeks: null,
    transplant_start: null, transplant_end: null, harvest_start: null, harvest_end: null, harvest_year_offset: 0,
    succession_days: null, notes: null, ...w,
  });
  const lettuce: CropTiming = { daysToHarvest: 50, harvestDurationDays: 20, frostSensitive: false, perennial: false };
  // ágyásban: 1. márc. 20.–máj. 29.; 2. márc. 15.–máj. 24.; 3. máj. 1.–júl. 10.; 4. aug. 15.–okt. 24.
  const windows = [
    win(1, 'palanta', { sow_start: '02-01', seedling_weeks: 6, transplant_start: '03-20' }),
    win(2, 'helyrevetes', { sow_start: '03-15' }),
    win(3, 'helyrevetes', { season: 'nyari', sow_start: '05-01' }),
    win(4, 'helyrevetes', { season: 'oszi', sow_start: '08-15' }),
  ];
  const pick = (day: string) => pickWindowForDay(windows, day, { year: 2027, crop: lettuce, frost });

  it('az elő-, fő- és utóvetemény napja a fagyhatárokból', () => {
    expect(phaseDays(2027, frost)).toEqual({ elo: '2027-04-12', fo: '2027-07-01', uto: '2027-09-22' });
  });

  it('azt az ablakot választja, amelyikben a növény a napon az ágyásban áll (a legkésőbb kezdődőt)', () => {
    expect(pick('2027-04-12')).toMatchObject({ window: { id: 1 }, method: 'palanta', dates: { transplant: '2027-03-20' } });
    // máj. 26-án az 1. és a 3. is ott áll: a később kezdődő
    expect(pick('2027-05-26')!.window.id).toBe(3);
  });

  it('ha egyik sem áll ott, a nap utáni legközelebbit, végül a nap előttit', () => {
    expect(pick('2027-07-20')!.window.id).toBe(4);
    expect(pick('2027-12-01')!.window.id).toBe(4);
    expect(pickWindowForDay([], '2027-04-12', { year: 2027, crop: lettuce, frost })).toBeNull();
  });
});

const planting = (id: number, o: Partial<PlantingListItem> = {}): PlantingListItem => ({
  ...blankPlanting(),
  id, year: 2027, plant_id: 7, plant_name: 'Paradicsom', bed_id: 1, method: 'palanta',
  plan_sow_date: '2027-03-15', plan_transplant_date: '2027-05-10', plan_harvest_start: '2027-07-14', plan_end_date: '2027-10-12',
  ...o,
});

describe('kapcsolt ültetések', () => {
  it('ugyanabban az ágyásban, azonos növény, módszer és tervezett dátumok', () => {
    const all = [
      planting(1),
      planting(2),
      planting(3, { plan_end_date: '2027-10-01' }),
      planting(4, { bed_id: 2 }),
      planting(5, { is_history: true }),
      planting(6, { actual_bed_id: 2 }),
      planting(7, { variety_id: 3 }),
    ];
    expect(linkedPlantings(all[0]!, all).map((p) => p.id)).toEqual([2]);
  });

  it('dátum nélküli ültetésnek nincs kapcsolt párja', () => {
    const blank = { plan_sow_date: null, plan_transplant_date: null, plan_harvest_start: null, plan_end_date: null };
    expect(linkedPlantings(planting(1, blank), [planting(1, blank), planting(2, blank)])).toEqual([]);
  });
});

describe('ütközésjavítás', () => {
  const salad = (o: Partial<PlantingListItem> = {}) =>
    planting(10, {
      plant_id: 8, plant_name: 'Saláta', method: 'helyrevetes',
      plan_sow_date: '2027-03-20', plan_transplant_date: null, plan_harvest_start: '2027-05-09', plan_end_date: '2027-06-05',
      ...o,
    });

  it('az előző korábban szabadítja fel a helyet, vagy az új később jön', () => {
    expect(clashFixes(planting(1), salad())).toEqual([
      { kind: 'elozo_vege', plantingId: 10, date: '2027-05-10' },
      { kind: 'kesobbi_eltolas', plantingId: 1, days: 26, date: '2027-06-05' },
    ]);
  });

  it('a betakarítás kezdete elé nem hozza a véget', () => {
    expect(clashFixes(planting(1), salad({ plan_harvest_start: '2027-05-20' })).map((f) => f.kind)).toEqual(['kesobbi_eltolas']);
  });

  it('már az ágyásba került ültetést nem told el', () => {
    expect(clashFixes(planting(1, { actual_transplant_date: '2027-05-10' }), salad()).map((f) => f.kind)).toEqual(['elozo_vege']);
  });
});
```

- [ ] **2.2 Futtatás, hogy lássuk a hibát**

Parancs: `npx vitest run src/shared/domain/layout.test.ts`
Várt: FAIL, hiányzó exportok (`placeInFree`, `phaseDays` …).

- [ ] **2.3 Időpont-feliratok** – a `src/shared/labels.ts` végére:

```ts
/** A kiosztás-szerkesztő pillanatképei: elő-, fő- és utóvetemény. */
export const LAYOUT_PHASES = ['elo', 'fo', 'uto'] as const;
export type LayoutPhase = (typeof LAYOUT_PHASES)[number];
export const LAYOUT_PHASE_LABEL: Record<LayoutPhase, string> = {
  elo: 'Elővetemény',
  fo: 'Fővetemény',
  uto: 'Utóvetemény',
};
```

- [ ] **2.4 A megvalósítás** – a `layout.ts` első sora (`import { placementsOverlap … } from './geometry.ts';`) erre cserélődik:

```ts
import type { LayoutPhase, PlantingMethod } from '../labels.ts';
import type { GrowingWindow, PlantingListItem } from '../types.ts';
import {
  bedStart,
  methodsForWindow,
  suggestDates,
  usesSow,
  usesTransplant,
  type CropTiming,
  type FrostDates,
  type PlantingDates,
} from './dates.ts';
import { placementsOverlap, rangesOverlap, type Period, type Placement } from './geometry.ts';
import { addDaysISO, diffDays, isoFromMonthDay } from './isoDate.ts';
import { effectiveBedId, effectiveDates, occupancyPeriod } from './plantings.ts';
```

A fájl végére:

```ts
// --- Új sáv ------------------------------------------------------------------

/**
 * Új sáv helye a szabad szakaszok közül (a hívó a `freeAxisRanges`-szel számolja az új
 * ültetés teljes időszakára, teljes hosszban): az első, ahová a kért szélesség befér;
 * ilyen híján a legnagyobb, legalább minimális szakasz, kitöltve. null: nincs szabad hely.
 */
export function placeInFree(free: [number, number][], span: number, crossLength: number): Placement | null {
  const full = (start: number, width: number) => ({
    axis_start_cm: start,
    axis_span_cm: width,
    cross_start_cm: 0,
    cross_span_cm: crossLength,
  });
  const fits = free.find(([s, e]) => e - s + EPS >= span);
  if (fits) return full(fits[0], span);
  const largest = [...free].sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  if (!largest || largest[1] - largest[0] < LAYOUT_MIN_CM - EPS) return null;
  return full(largest[0], largest[1] - largest[0]);
}

/** Hely híján: az új sáv a cél sáv végére kerül, a cél sáv pedig enged neki (a minimális méretéig). */
export function makeRoom(
  strips: LayoutStrip[],
  targetKey: number,
  span: number,
): { strips: LayoutStrip[]; placement: Placement } | null {
  const target = strips.find((s) => s.key === targetKey);
  if (!target || target.fixed) return null;
  const p = target.placement;
  const take = Math.min(span, p.axis_span_cm - LAYOUT_MIN_CM);
  if (take < LAYOUT_MIN_CM - EPS) return null;
  const end = endOf(p, 'axis');
  return {
    strips: strips.map((s) => (s.key === targetKey ? { ...s, placement: withRange(p, 'axis', p.axis_start_cm, end - take) } : s)),
    placement: withRange(p, 'axis', end - take, end),
  };
}

// --- Időpontok és vetési ablak --------------------------------------------------

/** Az elő-, fő- és utóvetemény pillanatképének napja: utolsó fagy − 4 hét, július 1., első fagy − 4 hét. */
export function phaseDays(year: number, frost: FrostDates): Record<LayoutPhase, string> {
  return {
    elo: addDaysISO(isoFromMonthDay(year, frost.lastFrost), -28),
    fo: `${year}-07-01`,
    uto: addDaysISO(isoFromMonthDay(year, frost.firstFrost), -28),
  };
}

export interface WindowChoice {
  window: GrowingWindow;
  method: PlantingMethod;
  dates: PlantingDates;
  period: Period;
}

/**
 * Melyik vetési ablakból jöjjön az új sáv: amelyikben a növény a napon az ágyásban áll
 * (több közül a legkésőbb kezdődő); ha egyik sem, a nap utáni legközelebbi, végül a nap előtti.
 */
export function pickWindowForDay(
  windows: GrowingWindow[],
  day: string,
  opts: { year: number; crop: CropTiming; frost: FrostDates },
): WindowChoice | null {
  const choices = windows.flatMap((w) => {
    const method = methodsForWindow(w.method)[0]!;
    const dates = suggestDates({ year: opts.year, window: w, method, crop: opts.crop, frost: opts.frost });
    const period = occupancyPeriod({
      year: opts.year,
      method,
      status: 'terv',
      perennial: opts.crop.perennial,
      plan_sow_date: usesSow(method) ? dates.sow : null,
      plan_transplant_date: usesTransplant(method) ? dates.transplant : null,
      plan_harvest_start: dates.harvestStart,
      plan_end_date: dates.end,
      actual_sow_date: null,
      actual_transplant_date: null,
      actual_harvest_start: null,
      actual_end_date: null,
    });
    return period ? [{ window: w, method, dates, period }] : [];
  });
  const byStartDesc = (a: WindowChoice, b: WindowChoice) => b.period.start.localeCompare(a.period.start);
  const containing = choices.filter((c) => c.period.start <= day && day < c.period.end).sort(byStartDesc);
  const after = choices.filter((c) => c.period.start > day).sort((a, b) => a.period.start.localeCompare(b.period.start));
  const before = choices.filter((c) => c.period.end <= day).sort(byStartDesc);
  return containing[0] ?? after[0] ?? before[0] ?? null;
}

// --- Kapcsolt ültetések és ütközésjavítás ------------------------------------------

const PLAN_DATE_KEYS = ['plan_sow_date', 'plan_transplant_date', 'plan_harvest_start', 'plan_end_date'] as const;

/**
 * Kapcsolt ültetések: ugyanabban az ágyásban és évben, azonos növény, fajta, módszer és
 * mind a négy tervezett dátum. Az elmaradt, a gyors előzmény és a dátum nélküli nem számít.
 */
export function linkedPlantings(p: PlantingListItem, all: PlantingListItem[]): PlantingListItem[] {
  const eligible = (x: PlantingListItem) => !x.is_history && x.status !== 'elmaradt';
  const bed = effectiveBedId(p);
  if (!eligible(p) || bed == null || !(p.plan_sow_date || p.plan_transplant_date)) return [];
  return all.filter(
    (x) =>
      x.id !== p.id &&
      eligible(x) &&
      x.year === p.year &&
      effectiveBedId(x) === bed &&
      x.plant_id === p.plant_id &&
      x.variety_id === p.variety_id &&
      x.method === p.method &&
      PLAN_DATE_KEYS.every((k) => x[k] === p[k]),
  );
}

export type ClashFix =
  /** Az előző ültetés helye ezen a napon szabadul fel */
  | { kind: 'elozo_vege'; plantingId: number; date: string }
  /** A későbbi ültetés minden tervezett dátuma ennyi nappal később */
  | { kind: 'kesobbi_eltolas'; plantingId: number; days: number; date: string };

/**
 * Javítások két, ugyanott és egyszerre álló ültetésre. Az előző vége csak akkor hozható
 * előre, ha még nincs tényleges vége, és nem kerül a betakarítás kezdete elé; a későbbi
 * csak akkor tolható, ha még nem került az ágyásba.
 */
export function clashFixes(x: PlantingListItem, y: PlantingListItem): ClashFix[] {
  const px = occupancyPeriod(x);
  const py = occupancyPeriod(y);
  if (!px || !py) return [];
  const xFirst = px.start < py.start || (px.start === py.start && x.id < y.id);
  const [a, pa, b, pb] = xFirst ? [x, px, y, py] : [y, py, x, px];
  const out: ClashFix[] = [];
  const harvestA = effectiveDates(a).harvestStart;
  if (!a.actual_end_date && pb.start > pa.start && (!harvestA || pb.start >= harvestA)) {
    out.push({ kind: 'elozo_vege', plantingId: a.id, date: pb.start });
  }
  const bInBed = bedStart(b.method, { sow: b.actual_sow_date, transplant: b.actual_transplant_date, harvestStart: null, end: null });
  if (!bInBed && pa.end > pb.start) {
    out.push({ kind: 'kesobbi_eltolas', plantingId: b.id, days: diffDays(pb.start, pa.end), date: pa.end });
  }
  return out;
}
```

- [ ] **2.5 Futtatás, hogy átmenjen**

Parancs: `npx vitest run src/shared/domain/layout.test.ts && npm run typecheck`
Várt: PASS (31 teszt), a typecheck hiba nélkül.

- [ ] **2.6 Commit**

```bash
git add src/shared/labels.ts src/shared/domain/layout.ts src/shared/domain/layout.test.ts
git commit -m "Kiosztás: új sáv helye, elő-, fő- és utóvetemény, ablakválasztás, kapcsolt ültetések, ütközésjavítás

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### 3. lépés: tömeges mentés a szerveren

**Fájlok:**
- Módosítás: `src/shared/schemas.ts` (a `PlantingCreateInput` típus után)
- Módosítás: `src/server/repos/plantings.ts`
- Módosítás: `src/server/routes/plan.ts`
- Teszt: `src/server/plan.test.ts`

- [ ] **3.1 A hibás teszt** – a `src/server/plan.test.ts` végére:

```ts
describe('tömeges mentés', () => {
  const batch = (payload: object) => app.inject({ method: 'POST', url: '/api/plantings/batch', payload });
  const basil = (o: object = {}) => ({
    year: 2029, plant_id: plantId('bazsalikom'), bed_id: bed.id, method: 'palanta', axis_span_cm: 30,
    plan_transplant_date: '2029-05-15', plan_end_date: '2029-09-20', ...o,
  });
  const listed = async (): Promise<PlantingListItem[]> =>
    (await app.inject({ url: `/api/plantings?year=2029&bed_id=${bed.id}` })).json();

  it('létrehozás, módosítás és törlés egy kérésben', async () => {
    const [keep]: PlantingListItem[] = (await post(basil({ axis_start_cm: 0 }))).json();
    const [drop]: PlantingListItem[] = (await post(basil({ axis_start_cm: 30 }))).json();
    const res = await batch({
      create: [basil({ axis_start_cm: 60, plant_id: plantId('paradicsom') })],
      update: [{ id: keep!.id, data: basil({ axis_start_cm: 10 }) }],
      delete: [drop!.id],
    });
    expect(res.statusCode).toBe(200);
    const { created } = res.json() as { created: number[] };
    expect(created).toHaveLength(1);
    const list = await listed();
    expect(list.find((p) => p.id === keep!.id)?.axis_start_cm).toBe(10);
    expect(list.some((p) => p.id === drop!.id)).toBe(false);
    expect(list.find((p) => p.id === created[0])?.plant_name).toBe('Paradicsom');
  });

  it('egy hibás elemnél semmi sem változik', async () => {
    const before = await listed();
    const missing = await batch({ create: [basil({ axis_start_cm: 0 })], update: [{ id: 999_999, data: basil() }] });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe('Az ültetés nem található');
    const badPlant = await batch({ create: [basil(), basil({ plant_id: 999_999 })] });
    expect(badPlant.statusCode).toBe(400);
    expect(badPlant.json().error).toBe('A növény nem található.');
    expect(await listed()).toEqual(before);
  });

  it('üres kérést elutasít', async () => {
    const res = await batch({});
    expect(res.statusCode).toBe(400);
    expect(res.json().issues).toContainEqual({ path: '', message: 'Nincs mit menteni.' });
  });
});
```

- [ ] **3.2 Futtatás, hogy lássuk a hibát**

Parancs: `npx vitest run src/server/plan.test.ts -t "tömeges mentés"`
Várt: FAIL, 404 (nincs ilyen végpont).

- [ ] **3.3 Séma** – a `src/shared/schemas.ts`-ben a `export type PlantingCreateInput = …` sor után:

```ts
/** Tömeges mentés a kiosztás-szerkesztőből: egy tranzakcióban, vagy minden bekerül, vagy semmi. */
export const plantingBatchInput = z
  .object({
    create: z.array(plantingInput).default([]),
    update: z.array(z.object({ id: z.number().int().positive(), data: plantingInput })).default([]),
    delete: z.array(z.number().int().positive()).default([]),
  })
  .refine((b) => b.create.length + b.update.length + b.delete.length > 0, { message: 'Nincs mit menteni.' })
  .refine((b) => b.create.length + b.update.length + b.delete.length <= 200, {
    message: 'Egyszerre legfeljebb 200 módosítás menthető.',
  });
export type PlantingBatchInput = z.infer<typeof plantingBatchInput>;
```

- [ ] **3.4 Repo: tranzakció nélküli belső függvények** – a `src/server/repos/plantings.ts`-ben:

Az import kiegészül:

```ts
import type { PlantingActualInput, PlantingBatchInput, PlantingCreateInput, PlantingInput } from '../../shared/schemas.ts';
```

A `createPlantings` függvény teljes egészében erre cserélődik (a törzse változatlanul átkerül az `insertPlantings`-be):

```ts
/**
 * Új ültetés(ek) tranzakció nélkül – a hívó fogja tranzakcióba. Sorozatnál minden tag
 * időben eltolva, a következő szabad sávba kerül.
 */
function insertPlantings(db: DB, input: PlantingCreateInput): number[] {
  const { series, ...fields } = normalize(db, input);
  // A gyors előzmény már megtörtént ültetés
  const base = { ...fields, status: fields.is_history ? ('lezart' as const) : ('terv' as const) };
  if (!series) return [insert(db, 'planting', base)];

  const offsets = seriesOffsets(series.count, series.interval_days);
  let starts = offsets.map(() => base.axis_start_cm ?? null);
  const planned = pickPlanDates(base);
  const period = occupancyPeriod({ year: base.year, method: base.method ?? null, ...planned, ...NO_ACTUALS });
  if (base.bed_id && base.axis_start_cm != null && base.axis_span_cm != null && period) {
    const bed = getBed(db, base.bed_id);
    const { axis, cross } = bedAxes(bed);
    const first = {
      placement: {
        axis_start_cm: base.axis_start_cm,
        axis_span_cm: base.axis_span_cm,
        cross_start_cm: base.cross_start_cm ?? 0,
        cross_span_cm: base.cross_span_cm ?? cross,
      },
      period,
    };
    starts = placeSeries(first, offsets, axis, occupantsInBed(db, base.year, base.bed_id)).map(
      (o) => o.placement.axis_start_cm,
    );
  }

  const seriesId = randomUUID();
  const dates = {
    sow: planned.plan_sow_date,
    transplant: planned.plan_transplant_date,
    harvestStart: planned.plan_harvest_start,
    end: planned.plan_end_date,
  };
  return offsets.map((offset, i) => {
    const d = shiftDates(dates, offset);
    return insert(db, 'planting', {
      ...base,
      axis_start_cm: starts[i],
      plan_sow_date: d.sow,
      plan_transplant_date: d.transplant,
      plan_harvest_start: d.harvestStart,
      plan_end_date: d.end,
      series_id: seriesId,
      series_index: i + 1,
    });
  });
}

/** Új ültetés; sorozatnál minden tag időben eltolva, a következő szabad sávba kerül. */
export function createPlantings(db: DB, input: PlantingCreateInput): PlantingListItem[] {
  const ids = transaction(db, () => insertPlantings(db, input));
  return ids.map((id) => getPlanting(db, id));
}
```

Az `updatePlanting` és a `deletePlanting` erre cserélődik:

```ts
/** A terv teljes cseréje tranzakció nélkül (a tény adatokat és a státuszt nem érinti). */
function replacePlanting(db: DB, id: number, input: PlantingInput): void {
  const data = normalize(db, input);
  if (!update(db, 'planting', id, { ...PLAN_DEFAULTS, ...data, updated_at: new Date().toISOString() })) {
    throw notFound('Az ültetés');
  }
}

export function updatePlanting(db: DB, id: number, input: PlantingInput): PlantingListItem {
  transaction(db, () => replacePlanting(db, id, input));
  return getPlanting(db, id);
}

/** Törlés tranzakció nélkül; `wholeSeries` esetén a sorozat összes tagja. A törölt sorok száma. */
function removePlantings(db: DB, id: number, wholeSeries: boolean): number {
  const row = db.prepare('SELECT series_id FROM planting WHERE id = ?').get(id) as { series_id: string | null } | undefined;
  if (!row) throw notFound('Az ültetés');
  const ids =
    wholeSeries && row.series_id
      ? (db.prepare('SELECT id FROM planting WHERE series_id = ?').all(row.series_id) as { id: number }[]).map((r) => r.id)
      : [id];
  const del = db.prepare('DELETE FROM planting WHERE id = ?');
  const delState = db.prepare('DELETE FROM task_state WHERE task_key = ?');
  let changes = 0;
  for (const pid of ids) {
    changes += Number(del.run(pid).changes);
    // A generált feladatok állapota (áthelyezés, megjegyzés) is megy
    for (const slot of TASK_SLOTS) if (slot !== 'beszerzes') delState.run(taskKey(slot, pid));
  }
  return changes;
}

/** Törlés; `wholeSeries` esetén a sorozat összes tagja. Visszaadja a törölt sorok számát. */
export function deletePlanting(db: DB, id: number, wholeSeries = false): number {
  return transaction(db, () => removePlantings(db, id, wholeSeries));
}

/**
 * Tömeges mentés a kiosztás-szerkesztőből: törlés, módosítás, majd létrehozás egyetlen
 * tranzakcióban – egy hibás elemnél semmi sem változik. A létrehozottak azonosítói a kérés sorrendjében.
 */
export function savePlantingBatch(db: DB, input: PlantingBatchInput): { created: number[] } {
  return transaction(db, () => {
    for (const id of input.delete) removePlantings(db, id, false);
    for (const u of input.update) replacePlanting(db, u.id, u.data);
    return { created: input.create.flatMap((c) => insertPlantings(db, { ...c, series: null })) };
  });
}
```

- [ ] **3.5 Végpont** – a `src/server/routes/plan.ts`-ben az import:

```ts
import { plantingActualInput, plantingBatchInput, plantingCreateInput, plantingInput } from '../../shared/schemas.ts';
```

és az `app.post('/plantings', …)` után:

```ts
    app.post('/plantings/batch', async (req) => plantings.savePlantingBatch(db, plantingBatchInput.parse(req.body)));
```

- [ ] **3.6 Futtatás, hogy átmenjen**

Parancs: `npx vitest run src/server && npm run typecheck`
Várt: minden szerverteszt PASS (a régiek is: a refaktor nem változtat viselkedést), a typecheck hiba nélkül.

- [ ] **3.7 Commit**

```bash
git add src/shared/schemas.ts src/server/repos/plantings.ts src/server/routes/plan.ts src/server/plan.test.ts
git commit -m "Ültetések tömeges mentése egy tranzakcióban (POST /api/plantings/batch)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### 4. lépés: a szerkesztő piszkozata

**Fájlok:**
- Módosítás: `src/client/features/plan/plantingView.ts`
- Létrehozás: `src/client/features/garden/layoutDraft.ts`
- Teszt: `src/client/features/garden/layoutDraft.test.ts`

- [ ] **4.1 A hibás teszt** – `src/client/features/garden/layoutDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { linkedPlantings } from '@shared/domain/layout.ts';
import { blankPlanting } from '@shared/domain/plantings.ts';
import type { Bed, GrowingWindow, PlantListItem, PlantingListItem } from '@shared/types.ts';
import { applyFix, applyStrips, copyPlanting, isDirty, plantingFor, stripsAt, toBatch, type LayoutDraft } from './layoutDraft.ts';

const bed: Bed = {
  id: 1, garden_id: 1, name: 'Emelt 1', color: 'green', length_cm: 200, width_cm: 80, row_direction: 'hosszaban',
  pos_x_cm: null, pos_y_cm: null, rotation_deg: 0, bed_type: 'emelt', sun: null, soil: null, irrigation: null,
  notes: null, active_from_year: null, active_to_year: null, sort_order: 0,
};
const item = (id: number, o: Partial<PlantingListItem>): PlantingListItem => ({ ...blankPlanting(), id, year: 2027, bed_id: 1, ...o });
const tomato = item(1, {
  plant_id: 7, plant_name: 'Paradicsom', method: 'palanta', row_spacing_cm: 35, rows: 1, axis_start_cm: 0, axis_span_cm: 30,
  plan_sow_date: '2027-03-15', plan_transplant_date: '2027-05-10', plan_harvest_start: '2027-07-14', plan_end_date: '2027-10-12',
});
const salad = item(2, {
  plant_id: 8, plant_name: 'Saláta', method: 'helyrevetes', row_spacing_cm: 20, rows: 2, axis_start_cm: 0, axis_span_cm: 40,
  plan_sow_date: '2027-03-20', plan_harvest_start: '2027-05-09', plan_end_date: '2027-06-05',
});
const garlic = item(3, {
  year: 2026, plant_id: 9, plant_name: 'Fokhagyma', method: 'ultetes', axis_start_cm: 40, axis_span_cm: 40,
  plan_sow_date: '2026-10-10', plan_harvest_start: '2027-06-01', plan_end_date: '2027-06-20',
});
const draft = (items: PlantingListItem[], o: Partial<LayoutDraft> = {}): LayoutDraft => ({ items, deleted: [], nextId: -1, ...o });

describe('pillanatkép', () => {
  it('a napon álló, elhelyezett ültetések; a más évhez tartozó rögzített', () => {
    const d = draft([tomato, salad, garlic]);
    expect(stripsAt(d, bed, 2027, '2027-04-12').map((s) => [s.key, s.fixed])).toEqual([[2, false], [3, true]]);
    expect(stripsAt(d, bed, 2027, '2027-07-01').map((s) => s.key)).toEqual([1]);
  });
});

describe('visszaírás', () => {
  it('a szélességből újraszámolja a sorokat, a teljes hosszú sávnál üres a keresztirány', () => {
    const out = applyStrips(draft([salad]), [{ key: 2, placement: { axis_start_cm: 0, axis_span_cm: 60, cross_start_cm: 0, cross_span_cm: 200 } }], bed);
    expect(out.items[0]).toMatchObject({ axis_span_cm: 60, rows: 3, cross_start_cm: null, cross_span_cm: null });
  });

  it('a részleges hosszt eltárolja, a változatlan szélességnél a sorok maradnak', () => {
    const out = applyStrips(draft([salad]), [{ key: 2, placement: { axis_start_cm: 0, axis_span_cm: 40, cross_start_cm: 0, cross_span_cm: 100 } }], bed);
    expect(out.items[0]).toMatchObject({ rows: 2, cross_start_cm: 0, cross_span_cm: 100 });
  });
});

describe('új sáv', () => {
  const win = (id: number, method: GrowingWindow['method'], w: Partial<GrowingWindow>): GrowingWindow => ({
    id, plant_id: 8, variety_id: null, season: 'tavaszi', method, sow_start: null, sow_end: null, seedling_weeks: null,
    transplant_start: null, transplant_end: null, harvest_start: null, harvest_end: null, harvest_year_offset: 0,
    succession_days: null, notes: null, ...w,
  });
  const lettuce = (windows: GrowingWindow[]): PlantListItem => ({
    id: 8, code: 'salata', name_hu: 'Saláta', name_latin: null, family_id: 5, crop_group_id: 3, rotation_stage: 'level',
    nutrient_group: 2, perennial: false, frost_sensitive: false, in_row_spacing_cm: 25, row_spacing_cm: 30,
    days_to_harvest: 50, harvest_duration_days: 20, seed_viability_years: 4, sun: null, aliases_en: [], notes: null,
    data_status: 'alapertek', source: null, family_name: 'Fészkesek', crop_group_name: 'Levélzöldségek', variety_count: 0, windows,
  });
  const ctx = { id: -1, year: 2027, bedId: 1, day: '2027-04-12', frost: { lastFrost: '05-10', firstFrost: '10-20' }, cropGroupCode: 'level' };

  it('a napon az ágyásban álló ablakból, egy sor szélességben', () => {
    const p = plantingFor(lettuce([win(1, 'palanta', { sow_start: '02-01', seedling_weeks: 6, transplant_start: '03-20' })]), ctx);
    expect(p).toMatchObject({
      id: -1, bed_id: 1, plant_id: 8, plant_name: 'Saláta', crop_group_code: 'level', window_id: 1, method: 'palanta',
      plan_sow_date: '2027-02-06', plan_transplant_date: '2027-03-20', plan_harvest_start: '2027-05-09', plan_end_date: '2027-05-29',
      rows: 1, axis_span_cm: 30,
    });
  });

  it('ablak nélkül helyrevetés a pillanatkép napján', () => {
    expect(plantingFor(lettuce([]), ctx)).toMatchObject({ method: 'helyrevetes', window_id: null, plan_sow_date: '2027-04-12' });
  });

  it('a másolat kapcsolt pár, tény adatok nélkül', () => {
    const started = { ...tomato, status: 'folyamatban' as const, actual_transplant_date: '2027-05-12', notes: 'jól eredt' };
    const copy = copyPlanting(started, -5);
    expect(copy).toMatchObject({ id: -5, status: 'terv', actual_transplant_date: null, notes: null, plan_transplant_date: '2027-05-10' });
    expect(linkedPlantings(copy, [started, copy]).map((p) => p.id)).toEqual([1]);
  });
});

describe('mentés', () => {
  it('létrehozás, módosítás és törlés a különbségből', () => {
    const moved = { ...tomato, axis_start_cm: 10 };
    const batch = toBatch([tomato, salad], draft([moved, copyPlanting(salad, -1)], { deleted: [2] }));
    expect(batch.create).toHaveLength(1);
    expect(batch.create[0]).toMatchObject({ plant_id: 8, year: 2027 });
    expect(batch.update).toEqual([{ id: 1, data: expect.objectContaining({ axis_start_cm: 10 }) }]);
    expect(batch.delete).toEqual([2]);
    expect(isDirty([tomato, salad], draft([tomato, salad]))).toBe(false);
  });

  it('ütközésjavítás: a vég előrehozása és a dátumok eltolása', () => {
    const d = draft([tomato, salad]);
    expect(applyFix(d, { kind: 'elozo_vege', plantingId: 2, date: '2027-05-10' }).items[1]!.plan_end_date).toBe('2027-05-10');
    expect(applyFix(d, { kind: 'kesobbi_eltolas', plantingId: 1, days: 26, date: '2027-06-05' }).items[0]).toMatchObject({
      plan_sow_date: '2027-04-10', plan_transplant_date: '2027-06-05', plan_harvest_start: '2027-08-09', plan_end_date: '2027-11-07',
    });
  });
});
```

- [ ] **4.2 Futtatás, hogy lássuk a hibát**

Parancs: `npx vitest run src/client/features/garden/layoutDraft.test.ts`
Várt: FAIL, „Failed to resolve import "./layoutDraft.ts"”.

- [ ] **4.3 `plantingInputOf`** – a `src/client/features/plan/plantingView.ts` importjai közé:

```ts
import type { PlantingInput } from '@shared/schemas.ts';
```

és a `plantingTitle` után:

```ts
/** Az ültetés terv szerinti adatai a PUT és a tömeges mentés bemeneteként (teljes csere). */
export function plantingInputOf(p: PlantingListItem): PlantingInput {
  return {
    year: p.year,
    plant_id: p.plant_id,
    variety_id: p.variety_id,
    seed_stock_id: p.seed_stock_id,
    bed_id: p.bed_id,
    axis_start_cm: p.axis_start_cm,
    axis_span_cm: p.axis_span_cm,
    cross_start_cm: p.cross_start_cm,
    cross_span_cm: p.cross_span_cm,
    rows: p.rows,
    plant_count: p.plant_count,
    method: p.method,
    window_id: p.window_id,
    plan_sow_date: p.plan_sow_date,
    plan_transplant_date: p.plan_transplant_date,
    plan_harvest_start: p.plan_harvest_start,
    plan_end_date: p.plan_end_date,
    is_history: p.is_history,
    notes: p.notes,
  };
}
```

- [ ] **4.4 A piszkozat** – `src/client/features/garden/layoutDraft.ts`:

```ts
import { completeDates, EMPTY_DATES, shiftDates, usesSow, usesTransplant, type FrostDates } from '@shared/domain/dates.ts';
import { bedAxes, rowsForSpan, spanForRows, type Placement } from '@shared/domain/geometry.ts';
import { pickWindowForDay, samePlacement, type ClashFix, type LayoutStrip } from '@shared/domain/layout.ts';
import { isConfirmed } from '@shared/domain/plantingChecks.ts';
import { blankPlanting, effectiveBedId, occupancyPeriod, placementOf, planDates } from '@shared/domain/plantings.ts';
import type { PlantingBatchInput } from '@shared/schemas.ts';
import type { Bed, PlantListItem, PlantingListItem } from '@shared/types.ts';
import { plantingInputOf } from '../plan/plantingView.ts';

/**
 * A kiosztás-szerkesztő piszkozata: az ágyásban álló ültetések (az újak negatív azonosítóval)
 * és a törlendők. Mentésig minden itt változik; a „Kész” a `toBatch` különbségét küldi.
 */
export interface LayoutDraft {
  items: PlantingListItem[];
  deleted: number[];
  /** A következő új ültetés azonosítója (negatív) */
  nextId: number;
}

export const draftFrom = (plantings: PlantingListItem[], bed: Pick<Bed, 'id'>): LayoutDraft => ({
  items: plantings.filter((p) => effectiveBedId(p) === bed.id),
  deleted: [],
  nextId: -1,
});

/**
 * Rögzített: más évhez tartozik (pl. ősszel ültetett fokhagyma), vagy már megtörtént (tény adat,
 * tényleges hely). A szerkesztő nem mozdítja és nem törli; ez csak a részletes lapon lehet.
 */
export const isFixed = (p: PlantingListItem, year: number) =>
  p.year !== year || p.actual_axis_start_cm != null || isConfirmed(p);

/** A napon az ágyásban álló, elhelyezett ültetések sávjai. */
export function stripsAt(draft: LayoutDraft, bed: Bed, year: number, day: string): LayoutStrip[] {
  return draft.items.flatMap((p) => {
    const period = occupancyPeriod(p);
    const placement = placementOf(p, bed);
    if (!period || !placement || !(period.start <= day && day < period.end)) return [];
    return [{ key: p.id, placement, fixed: isFixed(p, year) }];
  });
}

/** Az ültetés terv szerinti helye; teljes hosszú sávnál a keresztirányú mezők üresek, mint az ültetési lapon. */
export function placeItem(p: PlantingListItem, pl: Placement, bed: Bed): PlantingListItem {
  const { cross } = bedAxes(bed);
  const before = placementOf(p, bed);
  const full = Math.abs(pl.cross_start_cm) < 0.5 && Math.abs(pl.cross_span_cm - cross) < 0.5;
  const sameWidth = before != null && Math.abs(before.axis_span_cm - pl.axis_span_cm) < 0.5;
  return {
    ...p,
    axis_start_cm: pl.axis_start_cm,
    axis_span_cm: pl.axis_span_cm,
    cross_start_cm: full ? null : pl.cross_start_cm,
    cross_span_cm: full ? null : pl.cross_span_cm,
    rows: sameWidth && p.rows ? p.rows : rowsForSpan(pl.axis_span_cm, p.row_spacing_cm),
  };
}

/** A szerkesztett sávok visszaírása (a rögzítettek és a változatlanok érintetlenek). */
export function applyStrips(draft: LayoutDraft, strips: LayoutStrip[], bed: Bed): LayoutDraft {
  const byId = new Map(strips.map((s) => [s.key, s]));
  return {
    ...draft,
    items: draft.items.map((p) => {
      const s = byId.get(p.id);
      if (!s || s.fixed) return p;
      const before = placementOf(p, bed);
      return before && samePlacement(before, s.placement) ? p : placeItem(p, s.placement, bed);
    }),
  };
}

export interface NewPlantingContext {
  id: number;
  year: number;
  bedId: number;
  /** A pillanatkép napja: ehhez igazodik a vetési ablak */
  day: string;
  frost: FrostDates;
  cropGroupCode: string | null;
}

/** Új ültetés a növényből, egy sor szélességben; hely nélkül (azt a hívó adja `placeItem`-mel). */
export function plantingFor(plant: PlantListItem, ctx: NewPlantingContext): PlantingListItem {
  const crop = {
    daysToHarvest: plant.days_to_harvest,
    harvestDurationDays: plant.harvest_duration_days,
    frostSensitive: plant.frost_sensitive,
    perennial: plant.perennial,
  };
  const choice = pickWindowForDay(plant.windows, ctx.day, { year: ctx.year, crop, frost: ctx.frost });
  const method = choice?.method ?? 'helyrevetes';
  const dates = choice?.dates ?? completeDates({ ...EMPTY_DATES, sow: ctx.day }, method, crop, ctx.frost);
  return {
    ...blankPlanting(),
    id: ctx.id,
    year: ctx.year,
    bed_id: ctx.bedId,
    plant_id: plant.id,
    plant_name: plant.name_hu,
    family_id: plant.family_id,
    family_name: plant.family_name,
    crop_group_id: plant.crop_group_id,
    crop_group_code: ctx.cropGroupCode,
    crop_group_name: plant.crop_group_name,
    rotation_stage: plant.rotation_stage,
    nutrient_group: plant.nutrient_group,
    perennial: plant.perennial,
    frost_sensitive: plant.frost_sensitive,
    in_row_spacing_cm: plant.in_row_spacing_cm,
    row_spacing_cm: plant.row_spacing_cm,
    days_to_harvest: plant.days_to_harvest,
    harvest_duration_days: plant.harvest_duration_days,
    seed_viability_years: plant.seed_viability_years,
    method,
    window_id: choice?.window.id ?? null,
    plan_sow_date: usesSow(method) ? dates.sow : null,
    plan_transplant_date: usesTransplant(method) ? dates.transplant : null,
    plan_harvest_start: dates.harvestStart,
    plan_end_date: dates.end,
    rows: 1,
    axis_span_cm: spanForRows(1, plant.row_spacing_cm),
  };
}

/** Kapcsolt másolat: ugyanaz a növény, fajta, vetőmag, módszer és tervezett dátumok, tény adatok nélkül. */
export function copyPlanting(p: PlantingListItem, id: number): PlantingListItem {
  return {
    ...p,
    id,
    bed_id: effectiveBedId(p),
    status: 'terv',
    series_id: null,
    series_index: null,
    series_size: null,
    carried_from_id: null,
    plant_count: null,
    notes: null,
    actual_sow_date: null,
    actual_transplant_date: null,
    actual_harvest_start: null,
    actual_end_date: null,
    actual_bed_id: null,
    actual_axis_start_cm: null,
    actual_axis_span_cm: null,
    actual_cross_start_cm: null,
    actual_cross_span_cm: null,
    eval_success: null,
    eval_yield: null,
    eval_recommend: null,
    eval_notes: null,
  };
}

export const addItem = (draft: LayoutDraft, p: PlantingListItem): LayoutDraft => ({ ...draft, items: [...draft.items, p] });

export const removeItem = (draft: LayoutDraft, id: number): LayoutDraft => ({
  ...draft,
  items: draft.items.filter((p) => p.id !== id),
  deleted: id > 0 ? [...draft.deleted, id] : draft.deleted,
});

/** Ütközésjavítás alkalmazása a tervezett dátumokra. */
export function applyFix(draft: LayoutDraft, fix: ClashFix): LayoutDraft {
  return {
    ...draft,
    items: draft.items.map((p) => {
      if (p.id !== fix.plantingId) return p;
      if (fix.kind === 'elozo_vege') return { ...p, plan_end_date: fix.date };
      const d = shiftDates(planDates(p), fix.days);
      return { ...p, plan_sow_date: d.sow, plan_transplant_date: d.transplant, plan_harvest_start: d.harvestStart, plan_end_date: d.end };
    }),
  };
}

/** A mentendő különbség: új ültetések, megváltozott tervek, törlések. */
export function toBatch(original: PlantingListItem[], draft: LayoutDraft): PlantingBatchInput {
  const before = new Map(original.map((p) => [p.id, JSON.stringify(plantingInputOf(p))]));
  return {
    create: draft.items.filter((p) => p.id < 0).map(plantingInputOf),
    update: draft.items
      .filter((p) => p.id > 0 && before.get(p.id) !== JSON.stringify(plantingInputOf(p)))
      .map((p) => ({ id: p.id, data: plantingInputOf(p) })),
    delete: draft.deleted,
  };
}

export function isDirty(original: PlantingListItem[], draft: LayoutDraft): boolean {
  const b = toBatch(original, draft);
  return b.create.length + b.update.length + b.delete.length > 0;
}
```

- [ ] **4.5 Futtatás, hogy átmenjen**

Parancs: `npx vitest run src/client/features/garden/layoutDraft.test.ts && npm run typecheck`
Várt: PASS (8 teszt), a typecheck hiba nélkül.

- [ ] **4.6 Commit**

```bash
git add src/client/features/plan/plantingView.ts src/client/features/garden/layoutDraft.ts src/client/features/garden/layoutDraft.test.ts
git commit -m "Kiosztás: a szerkesztő piszkozata (pillanatkép, visszaírás, új sáv, mentendő különbség)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### 5. lépés: széles lap és a húzható ágyáskép

**Fájlok:**
- Módosítás: `src/client/components/ui/Sheet.tsx`, `src/client/components/ui/Sheet.module.css`
- Létrehozás: `src/client/features/garden/BedLayout.module.css`
- Létrehozás: `src/client/features/garden/LayoutCanvas.tsx`

- [ ] **5.1 `wide` lap** – a `Sheet.tsx` `Props`-ába:

```ts
  /** Szélesebb ablak asztalon (pl. a kiosztás-szerkesztőhöz); telefonon nincs különbség */
  wide?: boolean;
```

a paraméterlistába `wide,` (a `children` elé), és a panel osztálya:

```tsx
      <div ref={panelRef} className={`${s.panel} ${wide ? s.wide : ''}`} role="dialog" aria-modal="true" aria-label={title}>
```

A `Sheet.module.css`-ben a `.panel { … }` szabály után (a `@media` blokk előtt, hogy telefonon a 100% szélesség felülírja):

```css
.wide {
  width: min(900px, 100%);
}
```

- [ ] **5.2 Stílusok** – `src/client/features/garden/BedLayout.module.css`:

```css
/* Kiosztás-szerkesztő */

.loading {
  padding: 16px 20px;
  color: var(--label-2);
}

/* Elő-, fő- és utóvetemény */
.phases {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
  gap: 8px;
  margin: 12px 16px 0;
}
.phase {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: 1.5px solid transparent;
  border-radius: 10px;
  background: var(--bg-grouped-2);
  text-align: left;
}
.phaseOn {
  border-color: var(--tint);
}
.phaseName {
  font-size: 13px;
  font-weight: 600;
}
.phaseDay {
  font-size: 12px;
  color: var(--label-2);
}
.mini {
  width: 100%;
  height: 26px;
  margin-top: 4px;
  border-radius: 4px;
}
.miniBed {
  fill: var(--fill-3);
}
.dayPick {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  color: var(--label-2);
}

/* Ágyáskép */
.canvasWrap {
  margin: 12px 16px 0;
  padding: 10px;
  border-radius: 10px;
  background: var(--bg-grouped-2);
}
.canvas {
  display: block;
  width: 100%;
  height: auto;
  max-height: 380px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.bed {
  fill: var(--bg-grouped);
  stroke: var(--label-3);
  stroke-width: 1;
}
.grid {
  stroke: var(--separator);
  stroke-width: 0.5;
}
.strip {
  cursor: grab;
}
.strip rect {
  fill: color-mix(in srgb, var(--sc) 28%, white);
  stroke: var(--sc);
  stroke-width: 1.5;
}
.strip text {
  font-size: 12px;
  font-weight: 600;
  fill: color-mix(in srgb, var(--sc) 55%, black);
  pointer-events: none;
}
.selected rect {
  fill: color-mix(in srgb, var(--sc) 42%, white);
}
.linked rect {
  stroke-width: 2.5;
  stroke-dasharray: 5 3;
}
.fixed {
  cursor: default;
}
.fixed rect {
  fill: color-mix(in srgb, var(--c-gray) 14%, white);
  stroke: color-mix(in srgb, var(--c-gray) 55%, white);
}
.issueDot {
  fill: var(--c-orange);
}
.kerulendo .issueDot {
  fill: var(--c-red);
}
.boundary {
  stroke-width: 3;
  stroke-linecap: round;
  pointer-events: none;
}
.good {
  stroke: var(--c-green);
}
.bad {
  stroke: var(--c-red);
}
.selection {
  fill: none;
  stroke: var(--tint);
  stroke-width: 2;
  pointer-events: none;
}
.hit {
  fill: transparent;
}
.handle {
  fill: white;
  stroke: var(--tint);
  stroke-width: 1.5;
  pointer-events: none;
}
.dim {
  font-size: 12px;
  font-weight: 600;
  fill: var(--label-2);
}
.hint {
  margin: 6px 4px 0;
  font-size: 12px;
  color: var(--label-2);
}

/* Sávlista */
.rowList {
  margin: 12px 16px 0;
  border-radius: 10px;
  background: var(--bg-grouped-2);
  overflow: hidden;
}
.row {
  position: relative;
  background: var(--bg-grouped-2);
}
.row + .row {
  border-top: var(--hairline) solid var(--separator);
}
.moving {
  z-index: 2;
  box-shadow: var(--shadow-panel);
}
.rowMain {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 4px 12px 4px 4px;
}
.grip {
  display: grid;
  place-items: center;
  width: 28px;
  align-self: stretch;
  color: var(--label-3);
  cursor: grab;
  touch-action: none;
}
.range {
  min-width: 74px;
  font-size: 12px;
  color: var(--label-2);
  font-variant-numeric: tabular-nums;
}
.rowStrips {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}
.stripButton {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border-radius: 8px;
  background: var(--fill-4);
  color: var(--label);
  font-size: 14px;
}
.stripSelected {
  background: color-mix(in srgb, var(--sc) 22%, white);
  box-shadow: inset 0 0 0 1.5px var(--sc);
}
.dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--sc);
}
.stripTitle {
  font-weight: 500;
}
.stripLength {
  font-size: 12px;
  color: var(--label-2);
}
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.stepper button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--fill-3);
  color: var(--tint);
}

/* A kijelölt sáv részletei */
.detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 14px 12px 40px;
}
.detailRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
}
.detailActions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.detailActions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--fill-4);
  color: var(--tint);
  font-size: 13px;
}
.detailActions .danger {
  color: var(--c-red);
}

/* Hozzáadás és ütközések */
.addBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 10px 16px 0;
  padding: 4px;
}
.addBar .detailRow {
  flex: 1;
}
.addButton {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--tint);
  font-size: 15px;
  font-weight: 500;
}
.free {
  font-size: 12px;
  color: var(--label-2);
}
.clashes {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 16px 0;
}
.fixes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.fixes button {
  padding: 5px 10px;
  border-radius: 8px;
  background: var(--bg-grouped-2);
  color: var(--tint);
  font-size: 13px;
}

@media (max-width: 760px) {
  .phases {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .dayPick {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
  }
  .rowMain {
    flex-wrap: wrap;
  }
  .detail {
    padding-left: 14px;
  }
}
```

- [ ] **5.3 Az ágyáskép** – `src/client/features/garden/LayoutCanvas.tsx`:

```tsx
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { bedAxes, type Placement } from '@shared/domain/geometry.ts';
import { LAYOUT_GRID_CM, moveStrip, resizeStrip, type Boundary, type Edge, type LayoutStrip } from '@shared/domain/layout.ts';
import type { Bed } from '@shared/types.ts';
import s from './BedLayout.module.css';

export interface CanvasStrip extends LayoutStrip {
  label: string;
  /** CSS szín (a zöldségcsoporté) */
  color: string;
  issue: 'kerulendo' | 'figyelem' | null;
}

export interface CanvasBoundary extends Boundary {
  relation: 1 | -1;
  reason: string | null;
}

interface Props {
  bed: Bed;
  strips: CanvasStrip[];
  boundaries: CanvasBoundary[];
  selected: number | null;
  /** A kijelölt sávval kapcsolt sávok (kiemelve) */
  linked: Set<number>;
  onSelect: (key: number | null) => void;
  onChange: (strips: LayoutStrip[]) => void;
}

/** Sáv helye a képernyőn: vízszintesen mindig az ágyás hossza fut (mint a `BedDiagram`-on). */
export function rectOf(p: Placement, across: boolean, scale = 1) {
  return across
    ? { x: p.axis_start_cm * scale, y: p.cross_start_cm * scale, w: p.axis_span_cm * scale, h: p.cross_span_cm * scale }
    : { x: p.cross_start_cm * scale, y: p.axis_start_cm * scale, w: p.cross_span_cm * scale, h: p.axis_span_cm * scale };
}

type Side = 'l' | 'r' | 't' | 'b';
const CURSOR: Record<string, string> = {
  l: 'ew-resize', r: 'ew-resize', t: 'ns-resize', b: 'ns-resize',
  lt: 'nwse-resize', rb: 'nwse-resize', rt: 'nesw-resize', lb: 'nesw-resize',
};
const PAD = { left: 34, top: 10, right: 12, bottom: 26 };
const MAX_W = 820;
const MAX_H = 320;
/** A fogantyúk érintési területének fele: legalább 22 px az él körül */
const HIT = 11;
const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });
const gridLines = (cm: number) => Array.from({ length: Math.ceil(cm / 10) - 1 }, (_, i) => (i + 1) * 10);

interface Drag {
  key: number;
  /** null: mozgatás */
  edges: Edge[] | null;
  x0: number;
  y0: number;
  orig: LayoutStrip[];
  /** Történt-e már módosítás ebben a húzásban */
  moved: boolean;
}

/**
 * Az ágyás felülnézetben, szerkeszthető sávokkal. A kijelölt sáv a széleinél és a sarkainál
 * méretezhető (a vele érintkező szomszéd enged), a közepénél fogva mozgatható.
 */
export function LayoutCanvas({ bed, strips, boundaries, selected, linked, onSelect, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const across = bed.row_direction === 'keresztben';
  const size = bedAxes(bed);
  const scale = Math.min(MAX_W / bed.length_cm, MAX_H / bed.width_cm);
  const w = bed.length_cm * scale;
  const h = bed.width_cm * scale;

  const edgeOf = (side: Side): Edge =>
    across
      ? ({ l: 'axisStart', r: 'axisEnd', t: 'crossStart', b: 'crossEnd' } as const)[side]
      : ({ l: 'crossStart', r: 'crossEnd', t: 'axisStart', b: 'axisEnd' } as const)[side];

  /** A mutató helye cm-ben, az ágyás bal felső sarkától. */
  const pointCm = (e: ReactPointerEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current!.getScreenCTM()!.inverse());
    return { x: (p.x - PAD.left) / scale, y: (p.y - PAD.top) / scale };
  };

  const begin = (e: ReactPointerEvent, key: number, edges: Edge[] | null) => {
    e.stopPropagation();
    onSelect(key);
    if (strips.find((x) => x.key === key)?.fixed) return;
    const { x, y } = pointCm(e);
    drag.current = { key, edges, x0: x, y0: y, orig: strips.map(({ key, placement, fixed }) => ({ key, placement, fixed })), moved: false };
    svgRef.current!.setPointerCapture(e.pointerId);
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = pointCm(e);
    const delta = across ? { axis: x - d.x0, cross: y - d.y0 } : { axis: y - d.y0, cross: x - d.x0 };
    // Remegés ellen: a rácsköz felénél kisebb elmozdulás még nem módosít (a rácson kívüli régi élek sem ugranak el)
    if (Math.abs(delta.axis) < LAYOUT_GRID_CM / 2 && Math.abs(delta.cross) < LAYOUT_GRID_CM / 2) {
      if (d.moved) onChange(d.orig);
      d.moved = false;
      return;
    }
    const next = d.edges ? resizeStrip(d.orig, d.key, d.edges, delta, size) : moveStrip(d.orig, d.key, delta, size);
    if (next) {
      d.moved = true;
      onChange(next);
    }
  };

  const end = () => {
    drag.current = null;
  };

  /** A határvonal: a `dim` irányú pozíció a képernyő vízszintesén (függőleges vonal) vagy függőlegesén. */
  const lineOf = (b: Boundary) =>
    (b.dim === 'axis') === across
      ? { x1: b.at * scale, x2: b.at * scale, y1: b.from * scale, y2: b.to * scale }
      : { x1: b.from * scale, x2: b.to * scale, y1: b.at * scale, y2: b.at * scale };

  const sel = strips.find((x) => x.key === selected && !x.fixed);

  return (
    <svg
      ref={svgRef}
      className={s.canvas}
      viewBox={`0 0 ${w + PAD.left + PAD.right} ${h + PAD.top + PAD.bottom}`}
      role="group"
      aria-label={`${bed.name} kiosztása`}
      onPointerDown={() => onSelect(null)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <g transform={`translate(${PAD.left} ${PAD.top})`}>
        <rect data-layout-bed className={s.bed} width={w} height={h} rx={6} />
        {gridLines(bed.length_cm).map((cm) => (
          <line key={`x${cm}`} className={s.grid} x1={cm * scale} y1={0} x2={cm * scale} y2={h} />
        ))}
        {gridLines(bed.width_cm).map((cm) => (
          <line key={`y${cm}`} className={s.grid} x1={0} y1={cm * scale} x2={w} y2={cm * scale} />
        ))}

        {strips.map((strip) => {
          const r = rectOf(strip.placement, across, scale);
          const vertical = r.w < 70 && r.h > r.w;
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          const cls = [
            s.strip,
            strip.key === selected ? s.selected : '',
            linked.has(strip.key) ? s.linked : '',
            strip.fixed ? s.fixed : '',
            strip.issue === 'kerulendo' ? s.kerulendo : '',
          ].join(' ');
          return (
            <g key={strip.key} className={cls} style={{ '--sc': strip.color } as CSSProperties} onPointerDown={(e) => begin(e, strip.key, null)}>
              <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={4} />
              {(vertical ? r.h : r.w) >= 40 && (vertical ? r.w : r.h) >= 14 && (
                <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}>
                  {strip.label}
                </text>
              )}
              {strip.issue && <circle className={s.issueDot} cx={r.x + r.w - 9} cy={r.y + 9} r={4} />}
              <title>{strip.label}</title>
            </g>
          );
        })}

        {boundaries.map((b) => (
          <line key={`${b.a}-${b.b}-${b.dim}`} className={`${s.boundary} ${b.relation === 1 ? s.good : s.bad}`} {...lineOf(b)} />
        ))}

        {sel && <Handles rect={rectOf(sel.placement, across, scale)} edgeOf={edgeOf} onStart={(e, edges) => begin(e, sel.key, edges)} />}

        <text className={s.dim} x={w / 2} y={h + 20} textAnchor="middle">
          {nf.format(bed.length_cm / 100)} m
        </text>
        <text className={s.dim} x={-14} y={h / 2} textAnchor="middle" transform={`rotate(-90 -14 ${h / 2})`}>
          {nf.format(bed.width_cm / 100)} m
        </text>
      </g>
    </svg>
  );
}

/** A kijelölt sáv fogantyúi: az élek mentén és a sarkokban (a sarok két élt mozgat). */
function Handles({
  rect: r,
  edgeOf,
  onStart,
}: {
  rect: { x: number; y: number; w: number; h: number };
  edgeOf: (side: Side) => Edge;
  onStart: (e: ReactPointerEvent, edges: Edge[]) => void;
}) {
  const zones: [string, Side[], number, number, number, number][] = [
    ['l', ['l'], r.x - HIT, r.y + HIT, 2 * HIT, r.h - 2 * HIT],
    ['r', ['r'], r.x + r.w - HIT, r.y + HIT, 2 * HIT, r.h - 2 * HIT],
    ['t', ['t'], r.x + HIT, r.y - HIT, r.w - 2 * HIT, 2 * HIT],
    ['b', ['b'], r.x + HIT, r.y + r.h - HIT, r.w - 2 * HIT, 2 * HIT],
    ['lt', ['l', 't'], r.x - HIT, r.y - HIT, 2 * HIT, 2 * HIT],
    ['rt', ['r', 't'], r.x + r.w - HIT, r.y - HIT, 2 * HIT, 2 * HIT],
    ['lb', ['l', 'b'], r.x - HIT, r.y + r.h - HIT, 2 * HIT, 2 * HIT],
    ['rb', ['r', 'b'], r.x + r.w - HIT, r.y + r.h - HIT, 2 * HIT, 2 * HIT],
  ];
  const dots = [
    [r.x, r.y + r.h / 2], [r.x + r.w, r.y + r.h / 2], [r.x + r.w / 2, r.y], [r.x + r.w / 2, r.y + r.h],
    [r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h],
  ];
  return (
    <g>
      <rect className={s.selection} x={r.x} y={r.y} width={r.w} height={r.h} rx={4} />
      {zones
        .filter(([, , , , zw, zh]) => zw > 0 && zh > 0)
        .map(([id, sides, x, y, zw, zh]) => {
          const edges = sides.map(edgeOf);
          return (
            <rect
              key={id}
              data-handle={edges.join('-')}
              className={s.hit}
              x={x}
              y={y}
              width={zw}
              height={zh}
              style={{ cursor: CURSOR[id] }}
              onPointerDown={(e) => onStart(e, edges)}
            />
          );
        })}
      {dots.map(([x, y], i) => (
        <circle key={i} className={s.handle} cx={x} cy={y} r={5} />
      ))}
    </g>
  );
}
```

- [ ] **5.4 Ellenőrzés**

Parancs: `npm run typecheck`
Várt: hiba nélkül. (A komponenst a 7. lépés köti be; a viselkedést a 9–10. lépés ellenőrzi.)

- [ ] **5.5 Commit**

```bash
git add src/client/components/ui/Sheet.tsx src/client/components/ui/Sheet.module.css src/client/features/garden/BedLayout.module.css src/client/features/garden/LayoutCanvas.tsx
git commit -m "Kiosztás: húzható és méretezhető ágyáskép, széles lap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### 6. lépés: sávlista és időpontválasztó

**Fájlok:**
- Létrehozás: `src/client/features/garden/LayoutRowList.tsx`
- Létrehozás: `src/client/features/garden/LayoutPhasePicker.tsx`

- [ ] **6.1 Sávlista** – `src/client/features/garden/LayoutRowList.tsx`:

```tsx
import { GripVertical, Link2, Lock, Minus, Plus } from 'lucide-react';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LAYOUT_GRID_CM, type LayoutRow } from '@shared/domain/layout.ts';
import s from './BedLayout.module.css';

export interface RowStrip {
  key: number;
  title: string;
  color: string;
  /** „teljes hossz” vagy „0–100 cm” */
  length: string;
  linked: boolean;
  fixed: boolean;
}

interface Props {
  rows: LayoutRow[];
  strips: Map<number, RowStrip>;
  reorderable: boolean;
  selected: number | null;
  onSelect: (key: number) => void;
  onMoveRow: (from: number, to: number) => void;
  onResizeRow: (index: number, delta: number) => void;
  /** A kijelölt sáv részletei: a sora alatt nyílik ki */
  detail: ReactNode;
}

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });

/** A sávok soronként, az ágyás tengelye mentén; a fogantyúval egész sor húzható át (érintéssel is). */
export function LayoutRowList({ rows, strips, reorderable, selected, onSelect, onMoveRow, onResizeRow, detail }: Props) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const startY = useRef(0);
  const [dragging, setDragging] = useState<{ index: number; dy: number } | null>(null);

  /** Hányadik helyre kerül a húzott sor: a közepe mely sorok közepén jutott túl. */
  const targetIndex = (index: number, dy: number) => {
    const boxes = refs.current.map((el) => el?.getBoundingClientRect());
    const me = boxes[index];
    if (!me) return index;
    const center = me.top + me.height / 2 + dy;
    return boxes.filter((b, i) => i !== index && b && center > b.top + b.height / 2).length;
  };

  if (!rows.length) return null;
  return (
    <div className={s.rowList}>
      {rows.map((row, index) => {
        const items = row.keys.flatMap((k) => strips.get(k) ?? []);
        const fixed = items.some((x) => x.fixed);
        const offset = dragging?.index === index ? dragging.dy : null;
        return (
          <div
            key={row.keys.join('-')}
            ref={(el) => {
              refs.current[index] = el;
            }}
            className={`${s.row} ${offset !== null ? s.moving : ''}`}
            style={offset !== null ? ({ transform: `translateY(${offset}px)` } as CSSProperties) : undefined}
          >
            <div className={s.rowMain}>
              {reorderable && !fixed ? (
                <span
                  className={s.grip}
                  aria-label="Sor áthelyezése"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    startY.current = e.clientY;
                    setDragging({ index, dy: 0 });
                  }}
                  onPointerMove={(e) => {
                    if (dragging?.index === index) setDragging({ index, dy: e.clientY - startY.current });
                  }}
                  onPointerUp={() => {
                    if (dragging) {
                      const to = targetIndex(dragging.index, dragging.dy);
                      if (to !== dragging.index) onMoveRow(dragging.index, to);
                    }
                    setDragging(null);
                  }}
                  onPointerCancel={() => setDragging(null)}
                >
                  <GripVertical size={16} />
                </span>
              ) : (
                <span className={s.grip} />
              )}
              <span className={s.range}>
                {nf.format(row.start)}–{nf.format(row.start + row.span)} cm
              </span>
              <span className={s.rowStrips}>
                {items.map((x) => (
                  <button
                    key={x.key}
                    type="button"
                    className={`${s.stripButton} ${x.key === selected ? s.stripSelected : ''}`}
                    style={{ '--sc': x.color } as CSSProperties}
                    onClick={() => onSelect(x.key)}
                  >
                    <span className={s.dot} />
                    <span className={s.stripTitle}>{x.title}</span>
                    <span className={s.stripLength}>{x.length}</span>
                    {x.linked && <Link2 size={13} aria-label="kapcsolt" />}
                    {x.fixed && <Lock size={13} aria-label="rögzített" />}
                  </button>
                ))}
              </span>
              {!fixed && (
                <span className={s.stepper}>
                  <button type="button" aria-label="Keskenyebb sor" onClick={() => onResizeRow(index, -LAYOUT_GRID_CM)}>
                    <Minus size={14} />
                  </button>
                  <span>{nf.format(row.span)} cm</span>
                  <button type="button" aria-label="Szélesebb sor" onClick={() => onResizeRow(index, LAYOUT_GRID_CM)}>
                    <Plus size={14} />
                  </button>
                </span>
              )}
            </div>
            {selected != null && row.keys.includes(selected) && detail}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **6.2 Időpontválasztó** – `src/client/features/garden/LayoutPhasePicker.tsx`:

```tsx
import { LAYOUT_PHASES, LAYOUT_PHASE_LABEL, type LayoutPhase } from '@shared/labels.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import type { Placement } from '@shared/domain/geometry.ts';
import type { Bed } from '@shared/types.ts';
import { DateInput } from '../../components/ui/Form.tsx';
import { rectOf } from './LayoutCanvas.tsx';
import s from './BedLayout.module.css';

export type PhasePreview = { placement: Placement; color: string }[];

interface Props {
  bed: Bed;
  year: number;
  days: Record<LayoutPhase, string>;
  day: string;
  previews: Record<LayoutPhase, PhasePreview>;
  onChange: (day: string) => void;
}

/** Elő-, fő- és utóvetemény kis előnézettel, valamint tetszőleges nap. */
export function LayoutPhasePicker({ bed, year, days, day, previews, onChange }: Props) {
  const across = bed.row_direction === 'keresztben';
  return (
    <div className={s.phases}>
      {LAYOUT_PHASES.map((phase) => {
        const on = days[phase] === day;
        return (
          <button
            key={phase}
            type="button"
            aria-pressed={on}
            className={`${s.phase} ${on ? s.phaseOn : ''}`}
            onClick={() => onChange(days[phase])}
          >
            <span className={s.phaseName}>{LAYOUT_PHASE_LABEL[phase]}</span>
            <span className={s.phaseDay}>{shortDate(days[phase])}</span>
            <svg className={s.mini} viewBox={`0 0 ${bed.length_cm} ${bed.width_cm}`} preserveAspectRatio="none" aria-hidden>
              <rect className={s.miniBed} width={bed.length_cm} height={bed.width_cm} />
              {previews[phase].map((p, i) => {
                const r = rectOf(p.placement, across);
                return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} style={{ fill: p.color }} />;
              })}
            </svg>
          </button>
        );
      })}
      <label className={s.dayPick}>
        <span>Nap</span>
        <DateInput value={day} min={`${year}-01-01`} max={`${year}-12-31`} onChange={(v) => v && onChange(v)} />
      </label>
    </div>
  );
}
```

- [ ] **6.3 Ellenőrzés**

Parancs: `npm run typecheck`
Várt: hiba nélkül.

- [ ] **6.4 Commit**

```bash
git add src/client/features/garden/LayoutRowList.tsx src/client/features/garden/LayoutPhasePicker.tsx
git commit -m "Kiosztás: sávlista áthúzható sorokkal, elő-, fő- és utóvetemény választó

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### 7. lépés: a „Kiosztás” lap és a gomb az ágyás oldalán

**Fájlok:**
- Létrehozás: `src/client/features/garden/BedLayoutSheet.tsx`
- Módosítás: `src/client/features/garden/BedPage.tsx`

- [ ] **7.1 A lap** – `src/client/features/garden/BedLayoutSheet.tsx`:

```tsx
import { CopyPlus, Info, Minus, Plus, Scissors, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { LAYOUT_PHASES, type LayoutPhase } from '@shared/labels.ts';
import { relationOf } from '@shared/domain/companions.ts';
import { bedAxes, findClashes, freeAxisRanges, type Placement } from '@shared/domain/geometry.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import {
  boundaries as stripBoundaries,
  clashFixes,
  endOf,
  layoutRows,
  LAYOUT_GRID_CM,
  linkedPlantings,
  makeRoom,
  moveRow,
  moveStrip,
  phaseDays,
  placeInFree,
  resizeRow,
  resizeStrip,
  rowsReorderable,
  splitStrip,
  type ClashFix,
  type LayoutStrip,
} from '@shared/domain/layout.ts';
import { companionChecks, companionIssue, rotationChecks, type PlantingIssue } from '@shared/domain/plantingChecks.ts';
import { occupancyPeriod, placementOf } from '@shared/domain/plantings.ts';
import { DEFAULT_SETTINGS } from '@shared/settings.ts';
import type { PlantingBatchInput } from '@shared/schemas.ts';
import type { Bed, PlantingListItem } from '@shared/types.ts';
import { Select } from '../../components/ui/Form.tsx';
import { Notice, NoticeList } from '../../components/ui/Notice.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { cropColor } from '../../lib/cropColors.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation, useCropGroups, usePlantings, usePlants, useSettings } from '../../lib/queries.ts';
import { PlantingEditSheet } from '../plan/PlantingEditSheet.tsx';
import { placedInBed, plantingTitle } from '../plan/plantingView.ts';
import { useChecksContext } from '../plan/useChecks.ts';
import { LayoutCanvas, type CanvasBoundary, type CanvasStrip } from './LayoutCanvas.tsx';
import { LayoutPhasePicker, type PhasePreview } from './LayoutPhasePicker.tsx';
import { LayoutRowList, type RowStrip } from './LayoutRowList.tsx';
import {
  addItem,
  applyFix,
  applyStrips,
  copyPlanting,
  draftFrom,
  isDirty,
  isFixed,
  placeItem,
  plantingFor,
  removeItem,
  stripsAt,
  toBatch,
  type LayoutDraft,
} from './layoutDraft.ts';
import s from './BedLayout.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  bed: Bed;
  year: number;
}

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });
const NO_ROOM = 'Nincs hely az új sávnak: keskenyíts egy sávot, vagy válassz másik napot.';

function fixLabel(f: ClashFix, byId: Map<number, PlantingListItem>): string {
  const name = byId.get(f.plantingId)?.plant_name ?? '';
  return f.kind === 'elozo_vege' ? `${name}: a hely ${shortDate(f.date)} szabadul fel` : `${name} később (${shortDate(f.date)} után)`;
}

function Stepper({ label, value, onStep }: { label: string; value: number; onStep: (delta: number) => void }) {
  return (
    <div className={s.detailRow}>
      <span>{label}</span>
      <span className={s.stepper}>
        <button type="button" aria-label={`${label}: kevesebb`} onClick={() => onStep(-LAYOUT_GRID_CM)}>
          <Minus size={14} />
        </button>
        <span>{nf.format(value)} cm</span>
        <button type="button" aria-label={`${label}: több`} onClick={() => onStep(LAYOUT_GRID_CM)}>
          <Plus size={14} />
        </button>
      </span>
    </div>
  );
}

/**
 * Az ágyás kiosztása: egy nap pillanatképe (elő-, fő-, utóvetemény vagy tetszőleges nap),
 * húzható ágyáskép és sávlista. Minden a piszkozatban változik; a „Kész” egyben ment.
 */
export function BedLayoutSheet({ open, onClose, bed, year }: Props) {
  const { data: plantings } = usePlantings(year);
  const { data: plants = [] } = usePlants();
  const { data: groups = [] } = useCropGroups();
  const { data: settings } = useSettings();
  const checksCtx = useChecksContext(year);
  const frost = settings ?? DEFAULT_SETTINGS;
  const days = phaseDays(year, frost);
  const size = bedAxes(bed);

  const [day, setDay] = useState(days.fo);
  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  // A piszkozat a mentett állapotból indul: nyitáskor, és a részletes lap mentése után újra
  const [synced, setSynced] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const original = useMemo(() => (plantings ? draftFrom(plantings, bed).items : null), [plantings, bed]);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setSynced(false);
      setSelected(null);
      setAdding(false);
      setNotice(null);
      setDay(phaseDays(year, frost).fo);
      return;
    }
    if (original && !synced) {
      setDraft({ items: original, deleted: [], nextId: -1 });
      setSynced(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, original, synced]);

  // A napló is frissül: a törölt ültetés naplókapcsolata megszűnik, az azonosítója újra kiosztható
  const save = useApiMutation(
    (b: PlantingBatchInput) => api.post<{ created: number[] }>('/plantings/batch', b),
    [qk.plantings, qk.beds, qk.journal],
  );

  const items = draft?.items ?? [];
  const byId = new Map(items.map((p) => [p.id, p]));
  const dirty = !!(original && draft && isDirty(original, draft));
  const strips = draft ? stripsAt(draft, bed, year, day) : [];
  const rows = layoutRows(strips);
  const reorderable = rowsReorderable(rows) && !strips.some((x) => x.fixed);
  const groupCode = (id: number | null) => groups.find((g) => g.id === id)?.code ?? null;

  // Ellenőrzések a piszkozattal: a mentett változatok helyett a szerkesztettek számítanak
  const ctx =
    checksCtx && draft
      ? { ...checksCtx, all: [...checksCtx.all.filter((p) => !byId.has(p.id) && !draft.deleted.includes(p.id)), ...items] }
      : null;
  const issues = new Map<number, PlantingIssue[]>(
    ctx
      ? strips
          .filter((x) => !x.fixed)
          .map((x): [number, PlantingIssue[]] => {
            const p = byId.get(x.key)!;
            return [x.key, [...rotationChecks(p, ctx), ...companionChecks(p, ctx).map((hit) => companionIssue(p, hit))]];
          })
      : [],
  );

  const canvasStrips: CanvasStrip[] = strips.map((x) => {
    const p = byId.get(x.key)!;
    const list = issues.get(x.key) ?? [];
    return {
      ...x,
      label: `${p.plant_name} · ${nf.format(x.placement.axis_span_cm)} cm`,
      color: cropColor(p.crop_group_code),
      issue: list.some((i) => i.level === 'kerulendo') ? 'kerulendo' : list.some((i) => i.level === 'figyelem') ? 'figyelem' : null,
    };
  });
  const canvasBoundaries: CanvasBoundary[] = ctx
    ? stripBoundaries(strips).flatMap((b) => {
        const rel = relationOf(ctx.companions, byId.get(b.a)!.plant_id, byId.get(b.b)!.plant_id);
        return rel && rel.relation !== 0 ? [{ ...b, relation: rel.relation, reason: rel.reason }] : [];
      })
    : [];
  const sel = selected != null ? byId.get(selected) : undefined;
  const linkedIds = new Set(sel ? linkedPlantings(sel, items).map((p) => p.id) : []);
  const rowStrips = new Map<number, RowStrip>(
    strips.map((x): [number, RowStrip] => {
      const p = byId.get(x.key)!;
      const full = Math.abs(x.placement.cross_start_cm) < 0.5 && Math.abs(x.placement.cross_span_cm - size.cross) < 0.5;
      const from = x.placement.cross_start_cm;
      return [
        x.key,
        {
          key: x.key,
          title: plantingTitle(p),
          color: cropColor(p.crop_group_code),
          length: full ? 'teljes hossz' : `${nf.format(from)}–${nf.format(from + x.placement.cross_span_cm)} cm`,
          linked: linkedPlantings(p, items).length > 0,
          fixed: !!x.fixed,
        },
      ];
    }),
  );
  const clashes = findClashes(placedInBed(items, bed)).map((c) => {
    const a = byId.get(c.a)!;
    const b = byId.get(c.b)!;
    return { c, a, b, fixes: clashFixes(a, b) };
  });
  const previews = Object.fromEntries(
    LAYOUT_PHASES.map((phase) => [
      phase,
      draft
        ? stripsAt(draft, bed, year, days[phase]).map((x) => ({ placement: x.placement, color: cropColor(byId.get(x.key)?.crop_group_code) }))
        : [],
    ]),
  ) as Record<LayoutPhase, PhasePreview>;
  const freeM2 = (size.axis * size.cross - strips.reduce((sum, x) => sum + x.placement.axis_span_cm * x.placement.cross_span_cm, 0)) / 10000;

  // --- Műveletek ----------------------------------------------------------------

  /** A piszkozat módosítása; ha a művelet nem lehetséges (null), az üzenet jelenik meg. */
  const update = (fn: (d: LayoutDraft) => LayoutDraft | null, failMessage?: string) => {
    if (!draft) return;
    const next = fn(draft);
    if (!next) {
      if (failMessage) setNotice(failMessage);
      return;
    }
    setNotice(null);
    setDraft(next);
  };
  const withStrips = (next: LayoutStrip[] | null) => (d: LayoutDraft) => (next ? applyStrips(d, next, bed) : null);

  /** Ha az ültetés a választott napon nem áll az ágyásban, a pillanatkép az ágyásba kerülésére ugrik. */
  const showOnDay = (p: PlantingListItem) => {
    const period = occupancyPeriod(p);
    if (period && !(period.start <= day && day < period.end)) setDay(period.start);
  };

  /** Az új (vagy másolt) ültetés elhelyezése: szabad helyre, ennek híján a kijelölt vagy az utolsó sáv mellé. */
  const insert = (item: PlantingListItem) =>
    update((d) => {
      const period = occupancyPeriod(item);
      const span = item.axis_span_cm ?? 30;
      const free = period ? freeAxisRanges(size.axis, placedInBed(d.items, bed), period, { start: 0, span: size.cross }) : [];
      let next = d;
      let placement: Placement | null = placeInFree(free, span, size.cross);
      if (!placement) {
        const movable = strips.filter((x) => !x.fixed);
        const last = [...movable].sort((a, b) => endOf(a.placement, 'axis') - endOf(b.placement, 'axis')).at(-1);
        const target = movable.find((x) => x.key === selected) ?? last;
        const room = target ? makeRoom(strips, target.key, span) : null;
        if (!room) return null;
        next = applyStrips(next, room.strips, bed);
        placement = room.placement;
      }
      showOnDay(item);
      setSelected(item.id);
      return { ...addItem(next, placeItem(item, placement, bed)), nextId: d.nextId - 1 };
    }, NO_ROOM);

  const newFor = (plantId: number, id: number) => {
    const plant = plants.find((p) => p.id === plantId);
    return plant ? plantingFor(plant, { id, year, bedId: bed.id, day, frost, cropGroupCode: groupCode(plant.crop_group_id) }) : null;
  };

  const add = (plantId: number) => {
    setAdding(false);
    const item = draft ? newFor(plantId, draft.nextId) : null;
    if (item) insert(item);
  };

  const duplicate = (key: number) => {
    const p = byId.get(key);
    if (!p || !draft) return;
    insert({ ...copyPlanting(p, draft.nextId), axis_span_cm: placementOf(p, bed)?.axis_span_cm ?? p.axis_span_cm });
  };

  const split = (key: number) =>
    update((d) => {
      const p = d.items.find((x) => x.id === key);
      const next = splitStrip(strips, key, d.nextId);
      if (!p || !next) return null;
      setSelected(d.nextId);
      return { ...applyStrips(addItem(d, copyPlanting(p, d.nextId)), next, bed), nextId: d.nextId - 1 };
    }, 'A szétvágáshoz a sávnak legalább 20 cm hosszúnak kell lennie.');

  const remove = (key: number) => {
    const p = byId.get(key);
    if (!p) return;
    if (isFixed(p, year)) {
      setNotice('Ez az ültetés már elkezdődött vagy más évhez tartozik: a részletes lapon módosítható vagy törölhető.');
      return;
    }
    setSelected(null);
    update((d) => removeItem(d, key));
  };

  const changePlant = (key: number, plantId: number) =>
    update((d) => {
      const old = d.items.find((x) => x.id === key);
      const where = old ? placementOf(old, bed) : null;
      const fresh = newFor(plantId, key);
      if (!where || !fresh) return null;
      const item = placeItem(fresh, where, bed);
      showOnDay(item);
      return { ...d, items: d.items.map((x) => (x.id === key ? item : x)) };
    });

  const stepCross = (key: number, field: 'start' | 'span', delta: number) =>
    update(
      withStrips(
        field === 'start'
          ? moveStrip(strips, key, { axis: 0, cross: delta }, size)
          : resizeStrip(strips, key, ['crossEnd'], { axis: 0, cross: delta }, size),
      ),
    );

  const resizeRowAt = (index: number, delta: number) => {
    const row = rows[index];
    if (row) update(withStrips(resizeRow(strips, row, delta, size)), 'Ennél a sornál nincs több hely: előbb keskenyíts egy másikat.');
  };

  /** Részletes lap: ha van mentetlen módosítás, előbb ment (az új sáv így kap azonosítót). */
  const openDetails = (key: number) => {
    if (!draft || !original) return;
    if (!dirty) {
      setDetailsId(key);
      return;
    }
    const createIndex = draft.items.filter((p) => p.id < 0).findIndex((p) => p.id === key);
    save.mutate(toBatch(original, draft), {
      onSuccess: (res) => {
        setSelected(null);
        setSynced(false);
        setDetailsId(key < 0 ? (res.created[createIndex] ?? null) : key);
      },
      onError: (e) => setNotice(errorMessage(e)),
    });
  };

  const close = () => {
    if (dirty && !window.confirm('Elveted a kiosztás módosításait?')) return;
    onClose();
  };

  const confirmSave = () => {
    if (!draft || !original || !dirty) return onClose();
    save.mutate(toBatch(original, draft), { onSuccess: onClose, onError: (e) => setNotice(errorMessage(e)) });
  };

  const detailsPlanting = detailsId != null ? plantings?.find((p) => p.id === detailsId) : undefined;
  const selPlacement = sel ? placementOf(sel, bed) : null;
  const selVisible = sel && strips.some((x) => x.key === sel.id);

  const detail =
    sel && selVisible && selPlacement ? (
      <div className={s.detail}>
        {sel.id < 0 && (
          <label className={s.detailRow}>
            <span>Növény cseréje</span>
            <Select value={sel.plant_id} onChange={(e) => changePlant(sel.id, Number(e.target.value))}>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_hu}
                </option>
              ))}
            </Select>
          </label>
        )}
        {!isFixed(sel, year) && (
          <>
            <Stepper label="Hossz kezdete" value={selPlacement.cross_start_cm} onStep={(d) => stepCross(sel.id, 'start', d)} />
            <Stepper label="Hossza" value={selPlacement.cross_span_cm} onStep={(d) => stepCross(sel.id, 'span', d)} />
          </>
        )}
        <div className={s.detailActions}>
          {!isFixed(sel, year) && (
            <button type="button" onClick={() => split(sel.id)}>
              <Scissors size={15} /> Szétvágás hosszában
            </button>
          )}
          {!isFixed(sel, year) && (
            <button type="button" onClick={() => duplicate(sel.id)}>
              <CopyPlus size={15} /> Még egy sáv ebből
            </button>
          )}
          <button type="button" onClick={() => openDetails(sel.id)}>
            <Info size={15} /> Részletek
          </button>
          {!isFixed(sel, year) && (
            <button type="button" className={s.danger} onClick={() => remove(sel.id)}>
              <Trash2 size={15} /> Törlés
            </button>
          )}
        </div>
        <NoticeList items={(issues.get(sel.id) ?? []).map((i) => ({ level: i.level, message: i.message }))} />
      </div>
    ) : null;

  return (
    <Sheet
      title={`${bed.name} – kiosztás ${year}`}
      open={open}
      onClose={close}
      onConfirm={confirmSave}
      busy={save.isPending}
      error={notice}
      wide
    >
      {!draft ? (
        <p className={s.loading}>Betöltés…</p>
      ) : (
        <>
          <LayoutPhasePicker
            bed={bed}
            year={year}
            days={days}
            day={day}
            previews={previews}
            onChange={(d) => {
              setDay(d);
              setSelected(null);
            }}
          />
          <div className={s.canvasWrap}>
            <LayoutCanvas
              bed={bed}
              strips={canvasStrips}
              boundaries={canvasBoundaries}
              selected={selected}
              linked={linkedIds}
              onSelect={setSelected}
              onChange={(next) => update(withStrips(next))}
            />
            <p className={s.hint}>
              {strips.length
                ? 'Koppints egy sávra: a szélénél vagy a sarkánál méretezed, a közepénél mozgatod. A határon zöld vonal: jó szomszédok, piros: kerülendők.'
                : `${shortDate(day)}: az ágyás üres. Adj hozzá egy sávot.`}
            </p>
          </div>
          <LayoutRowList
            rows={rows}
            strips={rowStrips}
            reorderable={reorderable}
            selected={selected}
            onSelect={setSelected}
            onMoveRow={(from, to) => update(withStrips(moveRow(strips, rows, from, to)))}
            onResizeRow={resizeRowAt}
            detail={detail}
          />
          <div className={s.addBar}>
            {adding ? (
              <label className={s.detailRow}>
                <span>Növény</span>
                <Select value="" autoFocus onChange={(e) => add(Number(e.target.value))}>
                  <option value="" disabled>
                    Válassz…
                  </option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name_hu}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <button type="button" className={s.addButton} onClick={() => setAdding(true)}>
                <Plus size={15} /> Sáv hozzáadása
              </button>
            )}
            <span className={s.free}>szabad: {nf.format(Math.max(0, freeM2))} m²</span>
          </div>
          {clashes.length > 0 && (
            <div className={s.clashes}>
              {clashes.map(({ c, a, b, fixes }) => (
                <Notice key={`${c.a}-${c.b}`} level="figyelem">
                  Helyütközés {shortDate(c.period.start)} – {shortDate(c.period.end)}: {plantingTitle(a)} és {plantingTitle(b)} ugyanazt a
                  helyet foglalná.
                  {fixes.length > 0 && (
                    <span className={s.fixes}>
                      {fixes.map((f) => (
                        <button key={f.kind} type="button" onClick={() => update((d) => applyFix(d, f))}>
                          {fixLabel(f, byId)}
                        </button>
                      ))}
                    </span>
                  )}
                </Notice>
              ))}
            </div>
          )}
        </>
      )}
      {detailsPlanting && (
        <PlantingEditSheet
          open
          onClose={() => {
            setDetailsId(null);
            setSynced(false);
          }}
          planting={detailsPlanting}
          year={detailsPlanting.year}
        />
      )}
    </Sheet>
  );
}
```

- [ ] **7.2 Gomb az ágyás oldalán** – a `src/client/features/garden/BedPage.tsx`-ben:

Az első import sor:

```ts
import { Copy, Lightbulb, Pencil, Rows3 } from 'lucide-react';
```

a `./BedHistory.tsx` import után:

```ts
import { BedLayoutSheet } from './BedLayoutSheet.tsx';
```

az állapotok közé (a `suggesting` után):

```ts
  const [layoutOpen, setLayoutOpen] = useState(false);
```

a Felülnézet blokk nyitó sora erre cserélődik:

```tsx
      <Block
        title={`Felülnézet · ${formatDay(day)}`}
        action={
          <AddButton icon={<Rows3 size={15} strokeWidth={2.4} />} onClick={() => setLayoutOpen(true)}>
            Kiosztás
          </AddButton>
        }
      >
```

és a `<HistorySheet … />` elé:

```tsx
      <BedLayoutSheet open={layoutOpen} onClose={() => setLayoutOpen(false)} bed={bed} year={year} />
```

- [ ] **7.3 Ellenőrzés**

Parancs: `npm run typecheck && npm test`
Várt: hiba nélkül, minden teszt PASS.

- [ ] **7.4 Commit**

```bash
git add src/client/features/garden/BedLayoutSheet.tsx src/client/features/garden/BedPage.tsx
git commit -m "Ágyás kiosztása: a szerkesztő lap és a Kiosztás gomb az ágyás oldalán

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### 8. lépés: kapcsolt sávok az ültetési lapon

**Fájlok:**
- Módosítás: `src/client/features/plan/PlantingEditSheet.tsx`

- [ ] **8.1 Importok** – a `src/client/features/plan/PlantingEditSheet.tsx`-ben:

```ts
import { linkedPlantings } from '@shared/domain/layout.ts';
```

és a `./plantingView.ts` import:

```ts
import { axisLabel, blankPlanting, placedInBed, plantingInputOf, plantingTitle } from './plantingView.ts';
```

- [ ] **8.2 Állapot** – a `const [actual, setActual] = …` sor után:

```ts
  // A kapcsolt sávokra (azonos ágyás, növény, fajta, módszer és dátumok) is átvezetjük a módosítást
  const [linkOn, setLinkOn] = useState(true);
```

a megnyitáskori effektben a `if (planting) {` ág első sora:

```ts
      setLinkOn(true);
```

és az `others` számítása után:

```ts
  // A módosítás előtti állapot alapján: a mentett ültetés párjai
  const linked = useMemo(() => (planting ? linkedPlantings(planting, plantings ?? []) : []), [planting, plantings]);
```

- [ ] **8.3 Mentés** – a `save` mutációban a `if (planting) {` ág első két sora (`const { series: _series, ...update } = body;` és `await api.put(...)`) erre cserélődik:

```ts
      const { series: _series, ...update } = body;
      if (linkOn && linked.length) {
        // A párok helye, sorai, tőszáma és megjegyzése marad; a fajta, a vetőmag, a módszer és a dátumok követik
        await api.post('/plantings/batch', {
          update: [
            { id: planting.id, data: update },
            ...linked.map((x) => ({
              id: x.id,
              data: {
                ...plantingInputOf(x),
                variety_id: update.variety_id,
                seed_stock_id: update.seed_stock_id,
                window_id: update.window_id,
                method: update.method,
                plan_sow_date: update.plan_sow_date,
                plan_transplant_date: update.plan_transplant_date,
                plan_harvest_start: update.plan_harvest_start,
                plan_end_date: update.plan_end_date,
              },
            })),
          ],
        });
      } else {
        await api.put(`/plantings/${planting.id}`, update);
      }
```

- [ ] **8.4 Kapcsoló** – a `<NoticeList items={seedIssues} />` sor után:

```tsx
          {planting && linked.length > 0 && (
            <FormGroup footer="Ugyanebben az ágyásban, ugyanilyen dátumokkal álló sávok. A fajta, a vetőmag, a módszer és a dátumok változása rájuk is átkerül; a helyük nem változik.">
              <FormRow label={`Kapcsolt sávokon is (${linked.length})`}>
                <Toggle checked={linkOn} onChange={setLinkOn} label="Kapcsolt sávokon is" />
              </FormRow>
            </FormGroup>
          )}
```

- [ ] **8.5 Ellenőrzés**

Parancs: `npm run typecheck && npm test`
Várt: hiba nélkül, minden teszt PASS.

- [ ] **8.6 Commit**

```bash
git add src/client/features/plan/PlantingEditSheet.tsx
git commit -m "Ültetési lap: a módosítás a kapcsolt sávokra is átkerül

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### 9. lépés: végponttól végpontig, 12. lépés

**Fájlok:**
- Módosítás: `e2e/garden-flow.spec.ts`

- [ ] **9.1 A teszt** – a fájl elején a leírás második mondata kiegészül: „… → következő év javaslatai → ágyás másolása és kiosztása.” A 11. lépés `test.step` blokkja után, a `});` (a teszt vége) elé:

```ts
  await test.step('12. ágyás kiosztása: paradicsom–bazsalikom–paradicsom, méretezés húzással', async () => {
    await page.getByRole('main').getByText('E2E ágyás 2', { exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'E2E ágyás 2' })).toBeVisible();
    await page.getByRole('button', { name: 'Kiosztás' }).click();
    const sheet = dialog(page, 'E2E ágyás 2 – kiosztás 2028');
    await expect(sheet.getByRole('button', { name: /^Fővetemény/ })).toHaveAttribute('aria-pressed', 'true');

    // Csak a növényt kell választani: a dátum a vetési naptárból, a szélesség a sortávból jön
    for (const plant of ['Paradicsom', 'Bazsalikom']) {
      await sheet.getByRole('button', { name: 'Sáv hozzáadása' }).click();
      await field(sheet, 'Növény').selectOption({ label: plant });
    }
    await sheet.getByRole('button', { name: /^Paradicsom/ }).click();
    await sheet.getByRole('button', { name: 'Még egy sáv ebből' }).click();
    await expect(sheet.getByText('110–190 cm')).toBeVisible();

    await sheet.getByRole('button', { name: /^Bazsalikom/ }).click();
    await expect(sheet.getByText(/Jó szomszéd: paradicsom/)).toBeVisible();

    // A bazsalikom sávjának vége 15 cm-rel tovább: a mellette álló paradicsom enged
    const bedBox = (await sheet.locator('[data-layout-bed]').boundingBox())!;
    const pxPerCm = bedBox.width / 300;
    const handle = (await sheet.locator('[data-handle="axisEnd"]').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 15 * pxPerCm, y, { steps: 5 });
    await page.mouse.up();
    await expect(sheet.getByText('80–125 cm')).toBeVisible();
    await expect(sheet.getByText('125–190 cm')).toBeVisible();

    await confirm(sheet);
    await expect
      .poll(async () => {
        const items: { bed_name: string; plant_name: string; axis_start_cm: number; axis_span_cm: number }[] = await (
          await page.request.get('/api/plantings?year=2028')
        ).json();
        return items
          .filter((p) => p.bed_name === 'E2E ágyás 2')
          .sort((a, b) => a.axis_start_cm - b.axis_start_cm)
          .map((p) => [p.plant_name, p.axis_start_cm, p.axis_span_cm]);
      })
      .toEqual([
        ['Paradicsom', 0, 80],
        ['Bazsalikom', 80, 45],
        ['Paradicsom', 125, 65],
      ]);
  });
```

(A seed-adatokban a paradicsom sortávja 80 cm, a bazsalikomé 30 cm; az E2E ágyás 300 × 120 cm, keresztben futó sorokkal, így a tengely a 300 cm-es hossz.)

- [ ] **9.2 Futtatás**

Parancs: `npm run test:e2e`
Várt: `1 passed`. Ha a gépen nincs Chrome: `PW_CHANNEL=chromium npm run test:e2e`.

- [ ] **9.3 Commit**

```bash
git add e2e/garden-flow.spec.ts
git commit -m "E2E: ágyás kiosztása húzással és a szomszéd engedésével

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### 10. lépés: kézi ellenőrzés és dokumentáció

**Fájlok:**
- Módosítás: `CHANGELOG.md`, `CLAUDE.md`

- [ ] **10.1 Kézi ellenőrzés a `kerttervezo-uitest` példányon** (preview_start `{ name: "kerttervezo-uitest" }`, csak a `data/uitest.db`):
  1. Új 200 × 80 cm-es ágyás „hosszában” sorokkal → Kiosztás → Fővetemény: paradicsom, bazsalikom, „Még egy sáv ebből” → a bazsalikom a két paradicsom között; a határokon zöld vonal.
  2. Elővetemény: saláta a sor elején, „Szétvágás hosszában”, a második fél növénye sárgarépára cserélve.
  3. Fővetemény: a paradicsom helye ütközik a salátával → a javítógombok közül az elsővel megszűnik a jelzés.
  4. Mobil méret (resize_window `mobile`): a fogantyúk érintéssel húzhatók, a sávlista léptetői működnek, nincs vízszintes görgetés.
  5. „Kész” után az ágyás oldalán az idővonal és a felülnézet a három sávot mutatja; az egyik paradicsom ültetési lapján megjelenik a „Kapcsolt sávokon is (1)” kapcsoló, és egy dátummódosítás a párján is látszik.
  6. Képernyőkép asztali és telefonos méretben.

- [ ] **10.2 CHANGELOG** – a `CHANGELOG.md` „# Változások” bevezetője után, a legújabb fejezetként (a dátum a `date +%F` kimenete):

```markdown
## ÉÉÉÉ-HH-NN – Ágyás kiosztása

- **Kiosztás** az ágyás oldalán: a sorok húzással és ablakszerű fogantyúkkal méretezhetők; ha egy sáv a szomszédjába ütközik, a szomszéd enged.
- Elő-, fő- és utóvetemény választó (vagy tetszőleges nap): a lap mindig azt mutatja, ami azon a napon az ágyásban áll.
- Új sávhoz elég a növényt kiválasztani: a dátumok a vetési naptárból, a szélesség a sortávból jön.
- Szétvágás hosszában, „Még egy sáv ebből”, sávlista léptetőkkel és áthúzható sorokkal, telefonon is.
- A szomszédos sávok határán zöld vagy piros vonal jelzi a társítást; helyütközésnél egykattintásos javítás.
- Kapcsolt sávok: az ültetési lapon a fajta, a vetőmag, a módszer és a dátumok módosítása a kapcsolt sávokra is átkerül.
```

- [ ] **10.3 CLAUDE.md** – az „Architektúra / `src/shared/`” felsorolás végére:

```markdown
- **Kiosztás:** a `domain/layout.ts` a kiosztás-szerkesztő tiszta logikája (méretezés a szomszéd engedésével, csere, szétvágás, új sáv helye, elő-, fő- és utóvetemény, kapcsolt ültetések, ütközésjavítás). A szerkesztő piszkozatát a `features/garden/layoutDraft.ts` kezeli.
```

és a „`src/server/` / Segédfüggvények” felsorolás végére:

```markdown
  - A `repos/plantings.ts` tranzakció nélküli belső függvényei (`insertPlantings`, `replacePlanting`, `removePlantings`) a tömeges mentéshez kellenek: a `POST /api/plantings/batch` ezeket fogja össze egyetlen tranzakcióba, mert a `transaction()` nem ágyazható.
```

- [ ] **10.4 Teljes ellenőrzés**

Parancs: `npm run typecheck && npm test && npm run test:e2e`
Várt: mind hiba nélkül.

- [ ] **10.5 Commit**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "Changelog és CLAUDE.md: ágyás kiosztása

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
