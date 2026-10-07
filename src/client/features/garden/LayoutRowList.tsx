import { GripVertical, Link2, Lock, Minus, Plus } from 'lucide-react';
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { LAYOUT_GRID_CM, LAYOUT_MIN_CM, type LayoutRow } from '@shared/domain/layout.ts';
import { keyTarget, targetIndex, type RowBox } from './rowDrag.ts';
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

interface Drag {
  pointerId: number;
  index: number;
  startY: number;
  /** A fogantyú, amely a mutatót elfogta */
  grip: HTMLElement;
  /** A sorok helye a húzás kezdetekor, még elmozdítás nélkül */
  boxes: (RowBox | undefined)[];
}

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
/** Eddig a szélességig a sor nem keskenyíthető (a domain fél centis tűrésével) */
const NARROWEST_CM = LAYOUT_MIN_CM + 0.5;

/**
 * A sávok soronként, az ágyás tengelye mentén. A fogantyúval egész sor húzható át (érintéssel is),
 * vagy fókuszban a fel és le nyíllal léptethető.
 */
export function LayoutRowList({ rows, strips, reorderable, selected, onSelect, onMoveRow, onResizeRow, detail }: Props) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  /** A fogantyúk a sor kulcsa (az első sávja) szerint */
  const grips = useRef(new Map<number, HTMLElement>());
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<{ index: number; dy: number } | null>(null);
  /** A billentyűvel áthelyezett sor kulcsa */
  const refocus = useRef<number | null>(null);

  // Lefelé léptetéskor a React a fókuszált sort helyezi át a DOM-ban, és ettől a fókusz elveszik:
  // visszakerül a fogantyúra, hogy a nyíllal tovább lehessen léptetni.
  useLayoutEffect(() => {
    const key = refocus.current;
    if (key === null) return;
    refocus.current = null;
    const active = document.activeElement;
    if (!active || active === document.body) grips.current.get(key)?.focus();
  });

  const cancel = () => {
    drag.current = null;
    setDragging(null);
  };
  /** A futó húzás, ha ez az esemény a saját mutatójáé (egy második ujj nem szól bele) */
  const own = (e: ReactPointerEvent) => (drag.current?.pointerId === e.pointerId ? drag.current : null);

  if (!rows.length) return null;
  const canReorder = reorderable && rows.length > 1;
  return (
    <div className={dragging ? `${s.rowList} ${s.rowsDragging}` : s.rowList}>
      {rows.map((row, index) => {
        // a sor első sávja: felezéskor és másoláskor is a régi sorban marad, így a sor nem épül újra
        const rowKey = row.keys[0]!;
        const items = row.keys.flatMap((k) => strips.get(k) ?? []);
        const fixed = items.some((x) => x.fixed);
        const range = `${nf.format(row.start)}–${nf.format(row.start + row.span)} cm`;
        const offset = dragging?.index === index ? dragging.dy : null;
        return (
          <div
            key={rowKey}
            ref={(el) => {
              refs.current[index] = el;
            }}
            className={`${s.row} ${offset !== null ? s.moving : ''}`}
            style={offset !== null ? ({ transform: `translateY(${offset}px)` } as CSSProperties) : undefined}
          >
            <div className={s.rowMain}>
              {canReorder && !fixed ? (
                <span
                  ref={(el) => {
                    if (el) grips.current.set(rowKey, el);
                    else grips.current.delete(rowKey);
                  }}
                  role="button"
                  tabIndex={0}
                  className={`${s.grip} ${s.gripHandle}`}
                  aria-label={`Sor áthelyezése (${range})`}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  onKeyDown={(e) => {
                    const to = keyTarget(e.key, index, rows.length);
                    if (to === null) return;
                    // a sor szélén se görgessen az oldal
                    e.preventDefault();
                    if (to === index) return;
                    refocus.current = rowKey;
                    onMoveRow(index, to);
                  }}
                  onPointerDown={(e) => {
                    const d = drag.current;
                    // csak a bal gomb (vagy egy ujj) indít, és egyszerre egy húzás fut
                    if (e.button !== 0 || (d && d.grip.hasPointerCapture(d.pointerId))) return;
                    const grip = e.currentTarget;
                    grip.setPointerCapture(e.pointerId);
                    drag.current = {
                      pointerId: e.pointerId,
                      index,
                      startY: e.clientY,
                      grip,
                      boxes: rows.map((_, i) => refs.current[i]?.getBoundingClientRect()),
                    };
                    setDragging({ index, dy: 0 });
                  }}
                  onPointerMove={(e) => {
                    const d = own(e);
                    if (!d) return;
                    // a felengedés elveszett (pl. az ablakon kívül): a húzás elmarad
                    if (e.buttons === 0) {
                      cancel();
                      return;
                    }
                    setDragging({ index: d.index, dy: e.clientY - d.startY });
                  }}
                  onPointerUp={(e) => {
                    const d = own(e);
                    if (!d) return;
                    cancel();
                    const to = targetIndex(d.boxes, d.index, e.clientY - d.startY);
                    if (to !== d.index) onMoveRow(d.index, to);
                  }}
                  onPointerCancel={(e) => {
                    if (own(e)) cancel();
                  }}
                  onLostPointerCapture={(e) => {
                    if (own(e)) cancel();
                  }}
                >
                  <GripVertical size={16} />
                </span>
              ) : (
                <span className={s.grip} aria-hidden />
              )}
              <span className={s.range}>{range}</span>
              <span className={s.rowStrips}>
                {items.map((x) => (
                  <button
                    key={x.key}
                    type="button"
                    aria-pressed={x.key === selected}
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
                  <button
                    type="button"
                    aria-label={`Keskenyebb sor (${range})`}
                    disabled={row.span <= NARROWEST_CM}
                    onClick={() => onResizeRow(index, -LAYOUT_GRID_CM)}
                  >
                    <Minus size={14} />
                  </button>
                  <span>{nf.format(row.span)} cm</span>
                  <button
                    type="button"
                    aria-label={`Szélesebb sor (${range})`}
                    onClick={() => onResizeRow(index, LAYOUT_GRID_CM)}
                  >
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
