import { GripVertical, Link2, Lock, Minus, Plus } from 'lucide-react';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
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
  /** Átlépte-e már a mutató az indítási küszöböt (addig koppintás, nincs húzott sor) */
  started: boolean;
}

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
const rangeOf = (row: LayoutRow) => `${nf.format(row.start)}–${nf.format(row.start + row.span)} cm`;
/** Eddig a szélességig a sor nem keskenyíthető (a domain fél centis tűrésével) */
const NARROWEST_CM = LAYOUT_MIN_CM + 0.5;
/** Ekkora függőleges elmozdulás (képpont) még koppintás, nem húzás */
const SLOP_PX = 4;

/**
 * A sávok soronként, az ágyás tengelye mentén. A fogantyúval egész sor húzható át (érintéssel is),
 * vagy fókuszban a fel és le nyíllal léptethető.
 */
export function LayoutRowList({ rows, strips, reorderable, selected, onSelect, onMoveRow, onResizeRow, detail }: Props) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  /** A fogantyúk a sor kulcsa (az első sávja) szerint */
  const grips = useRef(new Map<number, HTMLElement>());
  /** A legutóbb kirajzolt sorok: a billentyűs áthelyezés utáni új hely bemondásához */
  const shownRows = useRef(rows);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<{ index: number; dy: number } | null>(null);
  /** A képernyőolvasónak bemondott új hely */
  const [announce, setAnnounce] = useState('');
  const hintId = useId();

  useLayoutEffect(() => {
    shownRows.current = rows;
  });

  const cancel = () => {
    drag.current = null;
    setDragging(null);
  };
  /** A futó húzás, ha ez az esemény a saját mutatójáé (egy második ujj nem szól bele) */
  const own = (e: ReactPointerEvent) => (drag.current?.pointerId === e.pointerId ? drag.current : null);
  /** Fut-e húzás (az újraépült sor eltűnt fogantyújáé már nem: az nem tarthatja fel a következőt) */
  const busy = () => {
    const d = drag.current;
    return !!d && d.grip.hasPointerCapture(d.pointerId);
  };

  /** Billentyűs áthelyezés: a fókusz a fogantyún marad, és az új hely elhangzik. */
  const moveByKey = (index: number, to: number, rowKey: number) => {
    // azonnal kirajzolva: ha a szülő elutasítja, nem marad függőben semmi
    flushSync(() => onMoveRow(index, to));
    // lefelé léptetéskor a React a fókuszált sort helyezi át a DOM-ban, és ettől a fókusz elveszik
    const grip = grips.current.get(rowKey);
    if (grip && document.activeElement !== grip) grip.focus();
    const now = shownRows.current.findIndex((r) => r.keys[0] === rowKey);
    const row = shownRows.current[now];
    if (now !== index && row) setAnnounce(`Áthelyezve: ${now + 1}. sor (${rangeOf(row)})`);
  };

  if (!rows.length) return null;
  const canReorder = reorderable && rows.length > 1;
  return (
    <>
      <div className={dragging ? `${s.rowList} ${s.rowsDragging}` : s.rowList}>
        {rows.map((row, index) => {
          // Kulcs: a sor első sávja. Felezéskor ez marad elöl (az új fél utána kerül), így a sor nem
          // épül újra, és a fókusz sem vész el; ha egy másolat ugyanebben a sorban elé kerül, újraépül.
          const rowKey = row.keys[0]!;
          const items = row.keys.flatMap((k) => strips.get(k) ?? []);
          const fixed = items.some((x) => x.fixed);
          const range = rangeOf(row);
          const narrowest = row.span <= NARROWEST_CM;
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
                    aria-describedby={hintId}
                    aria-keyshortcuts="ArrowUp ArrowDown"
                    onKeyDown={(e) => {
                      const to = keyTarget(e.key, index, rows.length);
                      if (to === null) return;
                      // a sor szélén se görgessen az oldal
                      e.preventDefault();
                      // húzás közben a felengedés a kezdeti sorszámmal dönt: addig nem léptetünk
                      if (to === index || busy()) return;
                      moveByKey(index, to, rowKey);
                    }}
                    onPointerDown={(e) => {
                      // csak a bal gomb (vagy egy ujj) indít, és egyszerre egy húzás fut
                      if (e.button !== 0 || busy()) return;
                      const grip = e.currentTarget;
                      grip.setPointerCapture(e.pointerId);
                      drag.current = {
                        pointerId: e.pointerId,
                        index,
                        startY: e.clientY,
                        grip,
                        boxes: rows.map((_, i) => refs.current[i]?.getBoundingClientRect()),
                        started: false,
                      };
                    }}
                    onPointerMove={(e) => {
                      const d = own(e);
                      if (!d) return;
                      // a felengedés elveszett (pl. az ablakon kívül): a húzás elmarad
                      if (e.buttons === 0) {
                        cancel();
                        return;
                      }
                      const dy = e.clientY - d.startY;
                      // koppintás közbeni remegés: a küszöb átlépéséig nincs húzott sor
                      if (!d.started && Math.abs(dy) < SLOP_PX) return;
                      d.started = true;
                      setDragging({ index: d.index, dy });
                    }}
                    onPointerUp={(e) => {
                      const d = own(e);
                      if (!d) return;
                      cancel();
                      if (!d.started) return;
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
                    {/* a legkeskenyebb sornál is fókuszban marad (a disabled elvenné a fókuszt) */}
                    <button
                      type="button"
                      aria-label={`Keskenyebb sor (${range})`}
                      aria-disabled={narrowest || undefined}
                      onClick={() => {
                        if (!narrowest) onResizeRow(index, -LAYOUT_GRID_CM);
                      }}
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
      {/* a lista után: a sorok közé téve elrontaná a szélső sorok kerekítését */}
      <span id={hintId} className="visually-hidden">
        Fel és le nyíllal mozgatható
      </span>
      <span className="visually-hidden" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
