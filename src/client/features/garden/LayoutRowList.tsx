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
