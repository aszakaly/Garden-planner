import { Maximize, Minus, Plus, RotateCw, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import {
  bedRect,
  footprint,
  gaps,
  isArchived,
  placementError,
  rotate,
  snapInto,
  type GardenSize,
  type Gaps,
  type PlanBed,
  type Rect,
} from '@shared/domain/gardenPlan.ts';
import type { BedListItem, Garden } from '@shared/types.ts';
import { api } from '../../lib/api.ts';
import { formatDimensions } from '../../lib/beds.ts';
import { colorVar } from '../../lib/colors.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation } from '../../lib/queries.ts';
import { useIsMobile } from '../../lib/useDevice.ts';
import { useYearGuard } from '../../lib/year.tsx';
import s from './GardenPlan.module.css';

const LEAVE = 'Mentetlen módosítások vannak a kert alaprajzán. Elveted őket?';
/** A rajz margója a méterfeliratoknak (cm-ben, a rajz léptékében). */
const MARGIN = 40;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

type Pos = Pick<PlanBed, 'pos_x_cm' | 'pos_y_cm' | 'rotation_deg'>;
type Bed = PlanBed & Pick<BedListItem, 'color' | 'row_direction'>;

interface Drag {
  id: number;
  /** A fogás helye az ágyás bal felső sarkától (cm). */
  grabX: number;
  grabY: number;
  rotation_deg: number;
  rect: Rect | null;
  error: string | null;
  gaps: Gaps | null;
  /** A pointer lenyomásának helye (képernyő-px); amíg nem mozdul el érdemben, ez csak kijelölés. */
  startX: number;
  startY: number;
  moved: boolean;
}

/** Ennyi képernyőpixel elmozdulás után számít húzásnak a lenyomás. */
const DRAG_THRESHOLD = 4;

interface Props {
  garden: Garden;
  beds: BedListItem[];
  onEditGarden: () => void;
}

export function GardenPlan({ garden, beds, onEditGarden }: Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  const [draft, setDraft] = useState<Map<number, Pos>>(new Map());
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const size: GardenSize | null =
    garden.length_cm && garden.width_cm ? { length_cm: garden.length_cm, width_cm: garden.width_cm } : null;

  // A piszkozattal együtt: a rajzon látható (nem archív) ágyások
  const planBeds: Bed[] = useMemo(
    () => beds.filter((b) => !isArchived(b, year)).map((b) => ({ ...b, ...draft.get(b.id) })),
    [beds, draft, year],
  );
  const placed = planBeds.filter((b) => bedRect(b) != null);
  const unplaced = planBeds.filter((b) => bedRect(b) == null);
  const changes = [...draft.entries()].filter(([id, p]) => {
    const orig = beds.find((b) => b.id === id);
    return orig && (orig.pos_x_cm !== p.pos_x_cm || orig.pos_y_cm !== p.pos_y_cm || orig.rotation_deg !== p.rotation_deg);
  });
  const dirty = changes.length > 0;

  const save = useApiMutation(
    () => api.put(`/gardens/${garden.id}/layout`, { beds: changes.map(([id, p]) => ({ id, ...p })) }),
    [qk.beds],
  );
  const commit = () =>
    save.mutate(undefined, {
      onSuccess: () => {
        setDraft(new Map());
        setNotice(null);
      },
      onError: (e) => setNotice(errorMessage(e)),
    });
  const discard = () => {
    setDraft(new Map());
    setSelected(null);
    setNotice(null);
  };

  const setPos = (id: number, p: Pos) => setDraft((d) => new Map(d).set(id, p));

  // Mentetlen módosítással az oldal elhagyása, az évváltás és a böngészőlap bezárása előtt kérdez
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(LEAVE)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useYearGuard(dirty, () => window.confirm(LEAVE));
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  // Kezdő lépték: a rajz kitölti a doboz szélességét
  const fitScale = () => {
    const w = boxRef.current?.clientWidth ?? 800;
    return size ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, (w - 2) / (size.length_cm + 2 * MARGIN))) : 1;
  };
  useEffect(() => {
    if (size && scale == null) setScale(fitScale());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size?.length_cm, size?.width_cm]);
  const zoom = (factor: number) => setScale((sc) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, (sc ?? fitScale()) * factor)));

  // Cmd/Ctrl + görgő: nagyítás (nem passzív figyelő, hogy a böngésző nagyítását megakadályozza)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  /** Képernyőpont → kert-koordináta (cm); `null`, ha a rajzon kívül esik. */
  const toCm = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg || !size) return null;
    const r = svg.getBoundingClientRect();
    const vbW = size.length_cm + 2 * MARGIN;
    const vbH = size.width_cm + 2 * MARGIN;
    const x = ((clientX - r.left) / r.width) * vbW - MARGIN;
    const y = ((clientY - r.top) / r.height) * vbH - MARGIN;
    // Csak a görgethető doboz látható része számít: a kilógó (nem látható) rajzrészre nem lehet ejteni
    const b = boxRef.current?.getBoundingClientRect() ?? r;
    const inside =
      clientX >= Math.max(r.left, b.left) && clientX <= Math.min(r.right, b.right) &&
      clientY >= Math.max(r.top, b.top) && clientY <= Math.min(r.bottom, b.bottom);
    return { x, y, inside };
  };

  const evaluate = (d: Drag, clientX: number, clientY: number): Drag => {
    const bed = planBeds.find((b) => b.id === d.id);
    const p = toCm(clientX, clientY);
    if (!bed || !p || !size) return d;
    if (!p.inside) return { ...d, rect: null, error: null, gaps: null };
    const fp = footprint({ ...bed, rotation_deg: d.rotation_deg });
    const at = snapInto(p.x - d.grabX, p.y - d.grabY, fp, size);
    const rect = { ...at, ...fp };
    return { ...d, rect, error: placementError(rect, bed.id, planBeds, size), gaps: gaps(rect, bed.id, planBeds, size) };
  };

  const latestDrag = useRef(drag);
  latestDrag.current = drag;
  const lastPointer = useRef({ x: 0, y: 0 });

  const startDrag = (e: ReactPointerEvent, bed: Bed, grab: { x: number; y: number }) => {
    if (isMobile || !size || e.button !== 0) return;
    e.preventDefault();
    setSelected(bed.id);
    setNotice(null);
    lastPointer.current = { x: e.clientX, y: e.clientY };
    const placedNow = bedRect(bed) != null;
    const d: Drag = {
      id: bed.id, grabX: grab.x, grabY: grab.y, rotation_deg: bed.rotation_deg, rect: null, error: null, gaps: null,
      startX: e.clientX, startY: e.clientY, moved: false,
    };
    // A rajzon álló ágyás a helyén marad, amíg el nem mozdul (kattintás = kijelölés)
    setDrag(placedNow ? d : evaluate(d, e.clientX, e.clientY));
  };

  // Húzás: a pointer az egész ablakban követett, így az elhelyezetlenek sávjából is húzható
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      setDrag((d) => {
        if (!d) return d;
        const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) >= DRAG_THRESHOLD;
        const placedNow = bedRect(planBeds.find((b) => b.id === d.id)!) != null;
        return moved || !placedNow ? evaluate({ ...d, moved }, e.clientX, e.clientY) : d;
      });
    };
    // Megszakadt húzás (pointercancel, ablakváltás): semmi nem változik
    const onCancel = () => setDrag(null);
    const onUp = () => {
      const d = latestDrag.current;
      setDrag(null);
      if (!d) return;
      const placedBefore = bedRect(planBeds.find((b) => b.id === d.id)!) != null;
      if (placedBefore && !d.moved) return;
      const bed = planBeds.find((b) => b.id === d.id)!;
      if (d.rect && !d.error) setPos(d.id, { pos_x_cm: d.rect.x, pos_y_cm: d.rect.y, rotation_deg: d.rotation_deg });
      else if (d.error) {
        const back = bedRect(bed) ? 'Visszakerült a helyére.' : 'Nem került fel a rajzra.';
        setNotice(`${bed.name}: ${d.error.charAt(0).toLowerCase()}${d.error.slice(1)} ${back}`);
      }
    };
    // R: forgatás húzás közben
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return;
      e.preventDefault();
      setDrag((d) => {
        if (!d) return d;
        const turned = { ...d, moved: true, rotation_deg: d.rotation_deg === 90 ? 0 : 90, grabX: d.grabY, grabY: d.grabX };
        return evaluate(turned, lastPointer.current.x, lastPointer.current.y);
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag != null, planBeds]);

  const selectedBed = planBeds.find((b) => b.id === selected) ?? null;

  const rotateSelected = () => {
    if (!selectedBed || !size) return;
    const r = rotate(selectedBed, planBeds, size);
    if ('error' in r) setNotice(`${selectedBed.name}: ${r.error.charAt(0).toLowerCase()}${r.error.slice(1)}`);
    else {
      setNotice(null);
      setPos(selectedBed.id, { pos_x_cm: r.bed.pos_x_cm, pos_y_cm: r.bed.pos_y_cm, rotation_deg: r.bed.rotation_deg });
    }
  };
  const unplace = () => {
    if (!selectedBed) return;
    setPos(selectedBed.id, { pos_x_cm: null, pos_y_cm: null, rotation_deg: selectedBed.rotation_deg });
    setSelected(null);
  };

  // Billentyűk (húzáson kívül): R forgat, Esc a kijelölést szünteti meg, Cmd/Ctrl+Enter ment
  const latest = useRef({ rotateSelected, commit, dirty, drag });
  latest.current = { rotateSelected, commit, dirty, drag };
  useEffect(() => {
    if (isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Nyitott lapnál (bárhol is a fókusz) a billentyűk a lapé
      if (t.closest('input, textarea, select') || document.querySelector('[role="dialog"]')) return;
      const l = latest.current;
      if (l.drag) return;
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) l.rotateSelected();
      else if (e.key === 'Escape') setSelected(null);
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && l.dirty) {
        e.preventDefault();
        l.commit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile]);

  if (!size) {
    return (
      <div className={s.empty}>
        <p>Az alaprajzhoz add meg a kert méretét (hossz és mélység).</p>
        <button type="button" className={s.primary} onClick={onEditGarden}>
          Kert méretének megadása
        </button>
      </div>
    );
  }

  const sc = scale ?? fitScale();
  const vbW = size.length_cm + 2 * MARGIN;
  const vbH = size.width_cm + 2 * MARGIN;
  const draggedBed = drag ? planBeds.find((b) => b.id === drag.id) : null;

  return (
    <div className={s.plan}>
      {!isMobile && (
        <div className={s.toolbar}>
          {selectedBed ? (
            <>
              <span className={s.selName}>{selectedBed.name}</span>
              <button type="button" className={s.tool} onClick={rotateSelected} disabled={!bedRect(selectedBed)} title="Forgatás (R)">
                <RotateCw size={15} /> Forgatás
              </button>
              <button type="button" className={s.tool} onClick={unplace} disabled={!bedRect(selectedBed)}>
                <Undo2 size={15} /> Levétel a rajzról
              </button>
              <button type="button" className={s.tool} onClick={() => navigate(`/agyas/${selectedBed.id}`)}>
                Munkalap
              </button>
            </>
          ) : (
            <span className={s.hint}>Húzd az ágyásokat a helyükre. Húzás közben az R forgat.</span>
          )}
          <span className={s.spacer} />
          <button type="button" className={s.icon} aria-label="Kicsinyítés" onClick={() => zoom(1 / 1.25)}>
            <Minus size={15} />
          </button>
          <button type="button" className={s.icon} aria-label="Nagyítás" onClick={() => zoom(1.25)}>
            <Plus size={15} />
          </button>
          <button type="button" className={s.icon} aria-label="Illesztés a képernyőhöz" onClick={() => setScale(fitScale())}>
            <Maximize size={15} />
          </button>
        </div>
      )}

      {!isMobile && unplaced.length > 0 && (
        <div className={s.unplaced} aria-label="Elhelyezésre vár">
          <span className={s.unplacedTitle}>Elhelyezésre vár</span>
          {unplaced.map((b) => (
            <button
              type="button"
              key={b.id}
              className={s.chip}
              data-active={drag?.id === b.id || undefined}
              style={{ ['--c' as string]: colorVar(b.color) }}
              onPointerDown={(e) => {
                const fp = footprint(b);
                startDrag(e, b, { x: fp.w / 2, y: fp.h / 2 });
              }}
            >
              <span className={s.chipSwatch} />
              {b.name}
              <span className={s.chipSize}>{formatDimensions(b.length_cm, b.width_cm)}</span>
            </button>
          ))}
        </div>
      )}

      <div className={s.box} ref={boxRef} onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
        <svg
          ref={svgRef}
          width={vbW * sc}
          height={vbH * sc}
          viewBox={`${-MARGIN} ${-MARGIN} ${vbW} ${vbH}`}
          className={s.svg}
          data-dragging={drag ? true : undefined}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || (e.target as Element).getAttribute('data-ground')) setSelected(null);
          }}
        >
          <Grid size={size} scale={sc} />
          {placed.map((b) => {
            const r = bedRect(b)!;
            const hidden = drag?.id === b.id && drag.rect != null;
            return (
              <BedShape
                key={b.id}
                bed={b}
                rect={r}
                scale={sc}
                selected={selected === b.id}
                ghost={hidden}
                onPointerDown={(e) => {
                  if (isMobile) return;
                  const p = toCm(e.clientX, e.clientY);
                  if (p) startDrag(e, b, { x: p.x - r.x, y: p.y - r.y });
                }}
                onOpen={() => navigate(`/agyas/${b.id}`)}
                mobile={isMobile}
              />
            );
          })}
          {drag?.rect && draggedBed && (
            <>
              <BedShape bed={{ ...draggedBed, rotation_deg: drag.rotation_deg }} rect={drag.rect} scale={sc} selected invalid={!!drag.error} />
              {drag.gaps && <GapLabels rect={drag.rect} gaps={drag.gaps} scale={sc} />}
            </>
          )}
        </svg>
      </div>

      {!isMobile && (notice || dirty) && (
        <div className={s.bottom}>
          {notice && (
            <div className={s.notice} role="alert">
              <span>{notice}</span>
              <button type="button" aria-label="Üzenet bezárása" onClick={() => setNotice(null)}>
                <X size={14} />
              </button>
            </div>
          )}
          {dirty && (
            <div className={s.saveBar} role="region" aria-label="Mentetlen módosítások">
              <span className={s.saveCount}>{changes.length} ágyás helye módosult</span>
              <button type="button" className={s.discard} disabled={save.isPending} onClick={discard}>
                Elvetés
              </button>
              <button type="button" className={s.save} disabled={save.isPending} onClick={commit} title="Mentés (Cmd+Enter)">
                {save.isPending ? 'Mentés…' : 'Mentés'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Rácsvonalak: 10 cm-enként halványan (ha elég nagy a lépték), méterenként erősebben, felirattal. */
function Grid({ size, scale }: { size: GardenSize; scale: number }) {
  const lines: React.ReactNode[] = [];
  const minor = scale * 10 >= 5;
  const step = minor ? 10 : 50;
  const font = 11 / scale;
  // Kis léptéknél (telefon) csak minden második méter kap feliratot, hogy ne fedjék egymást
  const labelEvery = scale * 100 < 40 ? 200 : 100;
  for (let x = 0; x <= size.length_cm; x += step) {
    const major = x % 100 === 0;
    if (!major && step === 50 && scale * 50 < 6) continue;
    lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={size.width_cm} className={major ? s.major : s.minor} />);
    if (major && x % labelEvery === 0) lines.push(<text key={`tx${x}`} x={x} y={-8 / scale} fontSize={font} className={s.axis} textAnchor="middle">{x / 100} m</text>);
  }
  for (let y = 0; y <= size.width_cm; y += step) {
    const major = y % 100 === 0;
    if (!major && step === 50 && scale * 50 < 6) continue;
    lines.push(<line key={`y${y}`} x1={0} y1={y} x2={size.length_cm} y2={y} className={major ? s.major : s.minor} />);
    if (major && y % labelEvery === 0) lines.push(<text key={`ty${y}`} x={-8 / scale} y={y} fontSize={font} className={s.axis} textAnchor="end" dominantBaseline="middle">{y / 100}</text>);
  }
  return (
    <g>
      <rect x={0} y={0} width={size.length_cm} height={size.width_cm} className={s.ground} data-ground="1" />
      {lines}
      <rect x={0} y={0} width={size.length_cm} height={size.width_cm} className={s.border} />
    </g>
  );
}

interface BedShapeProps {
  bed: Bed;
  rect: Rect;
  scale: number;
  selected?: boolean;
  ghost?: boolean;
  invalid?: boolean;
  mobile?: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onOpen?: () => void;
}

function BedShape({ bed, rect, scale, selected, ghost, invalid, mobile, onPointerDown, onOpen }: BedShapeProps) {
  // A sorok iránya: „hosszában” az ágyás hossza mentén futnak, „keresztben” arra merőlegesen
  const lengthHorizontal = bed.rotation_deg !== 90;
  const rowsHorizontal = (bed.row_direction === 'hosszaban') === lengthHorizontal;
  const rowLines = [0.25, 0.5, 0.75].map((f) =>
    rowsHorizontal ? (
      <line key={f} x1={rect.x + 4} x2={rect.x + rect.w - 4} y1={rect.y + rect.h * f} y2={rect.y + rect.h * f} className={s.row} />
    ) : (
      <line key={f} y1={rect.y + 4} y2={rect.y + rect.h - 4} x1={rect.x + rect.w * f} x2={rect.x + rect.w * f} className={s.row} />
    ),
  );
  const font = 12 / scale;
  const vertical = rect.h > rect.w * 1.4 && rect.w * scale < 90;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return (
    <g
      className={s.bed}
      style={{ ['--c' as string]: colorVar(bed.color), opacity: ghost ? 0.25 : undefined }}
      data-selected={selected || undefined}
      data-invalid={invalid || undefined}
      data-mobile={mobile || undefined}
      onPointerDown={onPointerDown}
      onDoubleClick={onOpen}
      onClick={mobile ? onOpen : undefined}
      role="button"
      aria-label={`${bed.name}, ${formatDimensions(bed.length_cm, bed.width_cm)}`}
    >
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={3} className={s.bedRect} />
      {rowLines}
      <text
        x={cx}
        y={cy}
        fontSize={font}
        className={s.bedName}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
      >
        {bed.name}
      </text>
    </g>
  );
}

/** Húzás közben a szabad távolság a négy irányban. */
function GapLabels({ rect, gaps: g, scale }: { rect: Rect; gaps: Gaps; scale: number }) {
  const font = 11 / scale;
  const items: React.ReactNode[] = [];
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const label = (key: string, x1: number, y1: number, x2: number, y2: number, v: number) => {
    if (v <= 0) return;
    items.push(
      <g key={key} className={s.gap}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2} fontSize={font} textAnchor="middle" dominantBaseline="middle">
          {v} cm
        </text>
      </g>,
    );
  };
  label('l', rect.x - g.left, cy, rect.x, cy, g.left);
  label('r', rect.x + rect.w, cy, rect.x + rect.w + g.right, cy, g.right);
  label('t', cx, rect.y - g.top, cx, rect.y, g.top);
  label('b', cx, rect.y + rect.h, cx, rect.y + rect.h + g.bottom, g.bottom);
  return <g pointerEvents="none">{items}</g>;
}
