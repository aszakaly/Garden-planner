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
