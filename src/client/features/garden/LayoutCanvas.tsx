import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { bedAxes } from '@shared/domain/geometry.ts';
import { LAYOUT_GRID_CM, moveStrip, resizeStrip, type Boundary, type Edge, type LayoutStrip } from '@shared/domain/layout.ts';
import type { Bed } from '@shared/types.ts';
import { useCoarsePointer, useWindowHeight } from '../../lib/useDevice.ts';
import {
  axesOf,
  canvasFit,
  canvasMaxH,
  dimsOf,
  dragStep,
  exceeds,
  handleTapTarget,
  handleZones,
  rectOf,
  sameStrips,
  slopCm,
  type Rect,
  type Side,
  type ZoneId,
} from './canvasGeometry.ts';
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

const CURSOR: Record<ZoneId, string> = {
  l: 'ew-resize', r: 'ew-resize', t: 'ns-resize', b: 'ns-resize',
  lt: 'nwse-resize', rb: 'nwse-resize', rt: 'nesw-resize', lb: 'nesw-resize',
};
const ISSUE_TITLE: Record<NonNullable<CanvasStrip['issue']>, string> = {
  kerulendo: 'kerülendő szomszéd',
  figyelem: 'figyelmeztetés',
};
/** A méréséig feltételezett szélesség (asztali lap) */
const FALLBACK_WIDTH = 848;
/**
 * A fogantyúk érintési sávjának fele képpontban: ujjal 44, egérrel 22 px széles sáv az él körül.
 * A `2 * hit`-nél keskenyebb irányban a sáv csak kifelé nyúlik (lásd `handleZones`).
 */
const HIT_PX = { coarse: 22, fine: 11 };
/** A fogantyúk pöttyének sugara képpontban */
const DOT_PX = { coarse: 5, fine: 4 };
/** A pötty körüli tűrés képpontban: a pöttyön (és ennyivel mellette) a koppintás a kijelölt sávé marad */
const DOT_TOL_PX = 3;
/** Ekkora elmozdulás (képpont) még koppintás, nem húzás */
const SLOP_PX = { mouse: 3, touch: 8 };
const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });
const gridLines = (cm: number) => Array.from({ length: Math.ceil(cm / 10) - 1 }, (_, i) => (i + 1) * 10);

interface Drag {
  pointerId: number;
  key: number;
  /** null: mozgatás */
  edges: Edge[] | null;
  x0: number;
  y0: number;
  /** A húzás kezdetekori kiosztás */
  orig: LayoutStrip[];
  /** A legutóbb jelentett kiosztás: ugyanazt nem jelentjük újra */
  last: LayoutStrip[];
  /** Indítási küszöb cm-ben (a mutató fajtájától és a nagyítástól függ) */
  slopCm: number;
  /** Átlépte-e már a mutató az indítási küszöböt */
  started: boolean;
}

/**
 * Az elem szélessége CSS-képpontban. A `clientWidth` és a ResizeObserver tartalomdoboza a
 * transzformációktól független, így a lap nyitó animációjának nagyítása nem számít bele
 * (a `getBoundingClientRect` a nagyított méretet adná).
 */
function useWidth(ref: RefObject<Element | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (w: number) => {
      if (w > 0) setWidth(w);
    };
    set(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => entry && set(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/**
 * Az ágyás felülnézetben, szerkeszthető sávokkal. A kijelölt sáv a széleinél és a sarkainál
 * méretezhető (a vele érintkező szomszéd enged), a közepénél fogva mozgatható. A kép egysége
 * egy CSS-képpont, így a feliratok és az érintési területek telefonon sem zsugorodnak el.
 * Billentyűzettel és felolvasóval a sávlista kezelhető, ezért a kép rejtett előlük.
 */
export function LayoutCanvas({ bed, strips, boundaries, selected, linked, onSelect, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  /** Húzás közben a mutató alakja (az elemek saját mutatója helyett) */
  const [dragCursor, setDragCursor] = useState<string | null>(null);
  const clipBase = `layout-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const coarse = useCoarsePointer();
  const width = useWidth(svgRef);
  const maxH = canvasMaxH(useWindowHeight());
  const across = bed.row_direction === 'keresztben';
  const size = bedAxes(bed);
  const hit = coarse ? HIT_PX.coarse : HIT_PX.fine;
  const dot = coarse ? DOT_PX.coarse : DOT_PX.fine;
  const { scale, w, h, viewW, viewH, left, top } = canvasFit(width ?? FALLBACK_WIDTH, bed.length_cm, bed.width_cm, { hit, maxH });

  const edgeOf = (side: Side): Edge =>
    across
      ? ({ l: 'axisStart', r: 'axisEnd', t: 'crossStart', b: 'crossEnd' } as const)[side]
      : ({ l: 'crossStart', r: 'crossEnd', t: 'axisStart', b: 'axisEnd' } as const)[side];

  /** A mutató helye cm-ben, az ágyás bal felső sarkától. */
  const pointCm = (e: ReactPointerEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current!.getScreenCTM()!.inverse());
    return { x: (p.x - left) / scale, y: (p.y - top) / scale };
  };

  const begin = (e: ReactPointerEvent, key: number, edges: Edge[] | null, cursor: string) => {
    // ne jusson el az ágyásig: az törölné a kijelölést (egy második ujjnál is)
    e.stopPropagation();
    dropStale(e);
    if (drag.current || e.button !== 0) return;
    // a fogantyú a már kijelölt sávé: nincs mit újra kijelölni
    if (key !== selected) onSelect(key);
    if (strips.find((x) => x.key === key)?.fixed) return;
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM()!;
    const { x, y } = pointCm(e);
    const orig = strips.map(({ key, placement, fixed }) => ({ key, placement, fixed }));
    drag.current = {
      pointerId: e.pointerId,
      key,
      edges,
      x0: x,
      y0: y,
      orig,
      last: orig,
      slopCm: slopCm(e.pointerType === 'mouse' ? SLOP_PX.mouse : SLOP_PX.touch, Math.hypot(ctm.a, ctm.b) * scale),
      started: false,
    };
    svg.setPointerCapture(e.pointerId);
    setDragCursor(cursor);
  };

  /** Az új kiosztás jelentése, ha eltér a legutóbbitól (minden jelentés újraszámolást indít a szülőben). */
  const emit = (d: Drag, next: LayoutStrip[]) => {
    if (sameStrips(next, d.last)) return;
    d.last = next;
    onChange(next);
  };

  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const svg = svgRef.current;
    if (svg?.hasPointerCapture(d.pointerId)) svg.releasePointerCapture(d.pointerId);
    setDragCursor(null);
  };

  /**
   * Árva húzás elengedése: ha egy új elsődleges mutató (új érintés, kattintás) vagy ugyanaz a mutató
   * újra lenyomódik, a régi húzás felengedése elveszett, és nem akadályozhatja a további érintéseket.
   */
  const dropStale = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (d && (d.pointerId === e.pointerId || e.isPrimary)) end();
  };

  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // a gomb felengedése elveszett (pl. az ablakon kívül): a húzás véget ért
    if (e.buttons === 0) {
      end();
      return;
    }
    const { x, y } = pointCm(e);
    const delta = axesOf(x - d.x0, y - d.y0, across);
    // csak a húzott élek irányát nézzük (mozgatásnál mindkettőt). A küszöb átlépéséig koppintás
    // (remegés), utána a rácsköz felénél kisebb elmozdulás nem módosít (a rácson kívüli régi élek
    // sem ugranak el).
    const step = dragStep(d.started, delta, dimsOf(d.edges), d.slopCm, LAYOUT_GRID_CM / 2);
    if (step === 'wait') return;
    d.started = true;
    if (step === 'orig') {
      emit(d, d.orig);
      return;
    }
    const next = d.edges ? resizeStrip(d.orig, d.key, d.edges, delta, size) : moveStrip(d.orig, d.key, delta, size);
    if (next) emit(d, next);
  };

  const up = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const { x, y } = pointCm(e);
    end();
    // Fogantyún húzás nélkül véget ért koppintás: a fogantyúk kifelé a szomszédra is rányúlnak,
    // ezért a kijelölt sávon kívül az ott álló sáv kijelölése, üres helyen a kijelölés megszüntetése.
    // Az él irányára merőleges (méretezést nem indító) hosszú húzás nem koppintás.
    if (d.started || !d.edges || exceeds(axesOf(x - d.x0, y - d.y0, across), ['axis', 'cross'], d.slopCm)) return;
    const target = handleTapTarget(d.orig, d.key, axesOf(d.x0, d.y0, across), (dot + DOT_TOL_PX) / scale);
    if (target !== undefined) onSelect(target);
  };

  /** Elveszett mutató (pl. a felengedés után): a húzás véget ér, koppintásként nem számít. */
  const lost = (e: ReactPointerEvent) => {
    if (drag.current?.pointerId === e.pointerId) end();
  };

  /** A megszakított húzás (pl. a rendszer elvette a mutatót) visszaáll a kezdeti állapotra. */
  const cancel = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    emit(d, d.orig);
    end();
  };

  /** A határvonal: a `dim` irányú pozíció a képernyő vízszintesén (függőleges vonal) vagy függőlegesén. */
  const lineOf = (b: Boundary) =>
    (b.dim === 'axis') === across
      ? { x1: b.at * scale, x2: b.at * scale, y1: b.from * scale, y2: b.to * scale }
      : { x1: b.from * scale, x2: b.to * scale, y1: b.at * scale, y2: b.at * scale };

  const sel = strips.find((x) => x.key === selected && !x.fixed);
  const shown = strips.map((strip) => ({ strip, r: rectOf(strip.placement, across, scale), clipId: `${clipBase}-${strip.key}` }));

  return (
    <svg
      ref={svgRef}
      className={dragCursor ? `${s.canvas} ${s.dragging}` : s.canvas}
      style={dragCursor ? { cursor: dragCursor } : undefined}
      viewBox={`0 0 ${viewW} ${viewH}`}
      aria-hidden="true"
      onPointerDown={(e) => {
        dropStale(e);
        // húzás közben egy második ujj ne törölje a kijelölést
        if (!drag.current && e.button === 0) onSelect(null);
      }}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={lost}
    >
      <defs>
        {/* a feliratok a saját sávjukon belül maradnak */}
        {shown.map(({ r, clipId }) => (
          <clipPath key={clipId} id={clipId}>
            <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} />
          </clipPath>
        ))}
      </defs>
      <g transform={`translate(${left} ${top})`}>
        <rect data-layout-bed className={s.bed} width={w} height={h} rx={6} />
        {gridLines(bed.length_cm).map((cm) => (
          <line key={`x${cm}`} className={s.grid} x1={cm * scale} y1={0} x2={cm * scale} y2={h} />
        ))}
        {gridLines(bed.width_cm).map((cm) => (
          <line key={`y${cm}`} className={s.grid} x1={0} y1={cm * scale} x2={w} y2={cm * scale} />
        ))}

        {shown.map(({ strip, r, clipId }) => {
          const vertical = r.w < 70 && r.h > r.w;
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          const cls = [
            s.strip,
            strip.key === selected && s.selected,
            linked.has(strip.key) && s.linked,
            strip.fixed && s.fixed,
            strip.issue === 'kerulendo' && s.kerulendo,
          ]
            .filter(Boolean)
            .join(' ');
          const title = [strip.label, strip.issue && ISSUE_TITLE[strip.issue], strip.fixed && 'rögzített'].filter(Boolean).join(' · ');
          return (
            <g
              key={strip.key}
              className={cls}
              style={{ '--sc': strip.color } as CSSProperties}
              onPointerDown={(e) => begin(e, strip.key, null, 'grabbing')}
            >
              <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx={4} />
              {(vertical ? r.h : r.w) >= 40 && (vertical ? r.w : r.h) >= 14 && (
                <g clipPath={`url(#${clipId})`}>
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}>
                    {strip.label}
                  </text>
                </g>
              )}
              {strip.issue && <circle className={s.issueDot} cx={r.x + r.w - 9} cy={r.y + 9} r={4} />}
              <title>{title}</title>
            </g>
          );
        })}

        {sel && (
          <Handles
            rect={rectOf(sel.placement, across, scale)}
            hit={hit}
            dot={dot}
            edgeOf={edgeOf}
            onStart={(e, edges, cursor) => begin(e, sel.key, edges, cursor)}
          />
        )}

        {/* A határvonal a kijelölés kerete fölött: a zöld vonal a kijelölt sáv mellett is látszik */}
        {boundaries.map((b) => (
          <line key={`${b.a}-${b.b}-${b.dim}`} className={`${s.boundary} ${b.relation === 1 ? s.good : s.bad}`} {...lineOf(b)} />
        ))}

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
  hit,
  dot,
  edgeOf,
  onStart,
}: {
  rect: Rect;
  /** Az érintési sáv fele képpontban */
  hit: number;
  /** A pöttyök sugara képpontban */
  dot: number;
  edgeOf: (side: Side) => Edge;
  onStart: (e: ReactPointerEvent, edges: Edge[], cursor: string) => void;
}) {
  const dots: [number, number][] = [
    [r.x, r.y + r.h / 2], [r.x + r.w, r.y + r.h / 2], [r.x + r.w / 2, r.y], [r.x + r.w / 2, r.y + r.h],
    [r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h],
  ];
  return (
    <g>
      <rect className={s.selection} x={r.x} y={r.y} width={r.w} height={r.h} rx={4} />
      {handleZones(r, hit).map((z) => {
        const edges = z.sides.map(edgeOf);
        return (
          <rect
            key={z.id}
            data-handle={edges.join('-')}
            className={s.hit}
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            style={{ cursor: CURSOR[z.id] }}
            onPointerDown={(e) => onStart(e, edges, CURSOR[z.id])}
          />
        );
      })}
      {dots.map(([x, y], i) => (
        <circle key={i} className={s.handle} cx={x} cy={y} r={dot} />
      ))}
    </g>
  );
}
