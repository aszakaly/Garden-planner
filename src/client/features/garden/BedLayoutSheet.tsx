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
  isFullLength,
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
  plantingFor,
  removeItem,
  replaceItem,
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

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
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

  // A kiinduló piszkozat (a sorszám alapjával együtt); a mentendő különbség ehhez képest számít
  const initial = useMemo(() => (plantings ? draftFrom(plantings, bed) : null), [plantings, bed]);
  const original = initial?.items ?? null;

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
    if (initial && !synced) {
      setDraft(initial);
      setSynced(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, synced]);

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
      const full = isFullLength(x.placement, size.cross);
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
      // az addItem lépteti a következő azonosítót is; a hely nélküli új ültetést az applyStrips helyezi el
      return applyStrips(addItem(next, item), [{ key: item.id, placement }], bed);
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
      return applyStrips(addItem(d, copyPlanting(p, d.nextId)), next, bed);
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

  /** Új sáv növényének cseréje: a hely marad, a dátumok és a sorszám az új növényé. */
  const changePlant = (key: number, plantId: number) =>
    update((d) => {
      const old = d.items.find((x) => x.id === key);
      const where = old ? placementOf(old, bed) : null;
      const fresh = newFor(plantId, key);
      if (!where || !fresh) return null;
      showOnDay(fresh);
      return applyStrips(replaceItem(d, fresh), [{ key, placement: where }], bed);
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
    if (row) {
      update(
        withStrips(resizeRow(strips, row, delta, size)),
        delta < 0 ? 'Ennél keskenyebb nem lehet a sor.' : 'Ennél a sornál nincs több hely: előbb keskenyíts egy másikat.',
      );
    }
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
