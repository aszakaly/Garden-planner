import { useEffect, useMemo, useState } from 'react';
import { LAYOUT_PHASES, type LayoutPhase } from '@shared/labels.ts';
import { relationOf } from '@shared/domain/companions.ts';
import { bedAxes, findClashes, spanForRows } from '@shared/domain/geometry.ts';
import { maxISO } from '@shared/domain/isoDate.ts';
import {
  boundaries as stripBoundaries,
  clashFixes,
  freeOnDay,
  insertPlacement,
  isFullLength,
  layoutRows,
  linkedPlantings,
  moveRow,
  moveStrip,
  phaseDays,
  resizeRow,
  resizeStrip,
  rowsReorderable,
  samePlacement,
  splitStrip,
  type ClashFix,
  type LayoutStrip,
} from '@shared/domain/layout.ts';
import {
  companionChecks,
  companionIssue,
  LEVEL_RANK,
  plantingDetailChecks,
  rotationChecks,
  uniqueIssues,
  type ChecksContext,
  type PlantingIssue,
} from '@shared/domain/plantingChecks.ts';
import { occupancyPeriod, placementOf } from '@shared/domain/plantings.ts';
import type { Suggestion } from '@shared/domain/suggestions.ts';
import { DEFAULT_SETTINGS } from '@shared/settings.ts';
import type { PlantingBatchInput } from '@shared/schemas.ts';
import type { Bed, PlantingListItem } from '@shared/types.ts';
import { api } from '../../../lib/api.ts';
import { cropColor } from '../../../lib/cropColors.ts';
import { errorMessage } from '../../../lib/errors.ts';
import { todayISO } from '../../../lib/format.ts';
import { qk, useApiMutation, useCropGroups, usePlantings, usePlants, useSeeds, useSettings } from '../../../lib/queries.ts';
import { placedInBed, plantingTitle } from '../../plan/plantingView.ts';
import { useChecksContext } from '../../plan/useChecks.ts';
import type { CanvasBoundary, CanvasGap, CanvasStrip } from '../LayoutCanvas.tsx';
import type { PhasePreview } from '../LayoutPhasePicker.tsx';
import type { RowStrip } from '../LayoutRowList.tsx';
import {
  addItem,
  applyFix,
  applyStrips,
  copyPlanting,
  draftFrom,
  isFixed,
  plantingFor,
  plantingFromSuggestion,
  removeItem,
  replaceItem,
  stripsAt,
  toBatch,
  type LayoutDraft,
} from '../layoutDraft.ts';

/** Mire vonatkozik a panel. */
export type Selection =
  | { kind: 'none' }
  /** A napon szabad szakasz a tengely mentén: javaslat oda */
  | { kind: 'gap'; start: number; end: number }
  /** Új sáv bárhová az ágyásba („+ Új sáv”) */
  | { kind: 'new' }
  | { kind: 'strip'; id: number };

const NONE: Selection = { kind: 'none' };
const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
export const NO_ROOM = 'Nincs hely az új sávnak: keskeníts egy sávot, vagy válassz másik napot.';
const PLANTS_LOADING = 'A növények adatai még töltődnek: próbáld újra egy pillanat múlva.';

/** A piszkozat és a kiinduló állapota: a mentendő különbség ehhez képest számít, nem a közben frissült listához. */
interface Session {
  from: LayoutDraft;
  draft: LayoutDraft;
}

export interface ClashView {
  key: string;
  a: PlantingListItem;
  b: PlantingListItem;
  start: string;
  end: string;
  fixes: ClashFix[];
}

/** Nyitáskor: az idei évben a mai nap, máskor a fővetemény napja. */
const initialDay = (year: number) => {
  const today = todayISO();
  return today.startsWith(`${year}-`) ? today : `${year}-07-01`;
};

const worstLevel = (list: PlantingIssue[] | undefined) =>
  list?.some((i) => i.level === 'kerulendo') ? 'kerulendo' : list?.some((i) => i.level === 'figyelem') ? 'figyelem' : null;

/**
 * Az ágyás-munkalap állapota: a piszkozat (a mentett állapotból indul, a „Mentés” egyben írja),
 * a vizsgált nap, a kijelölés, és minden, ami ezekből számolódik (sávok, szabad helyek,
 * ellenőrzések a piszkozatra). Ágyásonként és évenként új példány kell (`key`).
 */
export function useBedWorkspace(bed: Bed, year: number) {
  const { data: plantings } = usePlantings(year);
  const { data: plantList } = usePlants();
  const plants = useMemo(() => plantList ?? [], [plantList]);
  const { data: seeds = [] } = useSeeds();
  const { data: groups = [] } = useCropGroups();
  const { data: settings } = useSettings();
  const checksCtx = useChecksContext(year);
  const frost = settings ?? DEFAULT_SETTINGS;
  const days = useMemo(() => phaseDays(year, frost), [year, frost]);
  const size = useMemo(() => bedAxes(bed), [bed]);

  const [day, setDayState] = useState(() => initialDay(year));
  const [session, setSession] = useState<Session | null>(null);
  // A piszkozat a mentett állapotból indul: nyitáskor, mentés és elvetés után, és a részletes lap után
  const [synced, setSynced] = useState(false);
  const [selection, setSelection] = useState<Selection>(NONE);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);

  const initial = useMemo(() => (plantings ? draftFrom(plantings, bed) : null), [plantings, bed]);
  const draft = session?.draft ?? null;

  const save = useApiMutation(
    (b: PlantingBatchInput) => api.post<{ created: number[] }>('/plantings/batch', b),
    // a napló is frissül: a törölt ültetés naplókapcsolata megszűnik
    [qk.plantings, qk.beds, qk.journal],
  );

  // A mentendő különbség (csak a piszkozat változásakor számolódik újra)
  const batch = useMemo(() => (session ? toBatch(session.from.items, session.draft) : null), [session]);
  const changes = batch ? batch.create.length + batch.update.length + batch.delete.length : 0;
  const dirty = changes > 0;

  useEffect(() => {
    if (!initial) return;
    // Ha a mentett állapot közben kívülről változott (pl. a részletes lapon), és a piszkozatban
    // nincs mentetlen módosítás, a friss állapot lesz az új kiindulás; különben a régi marad
    const stale = !!session && session.from !== initial && !dirty;
    if (!synced || stale) {
      setSession({ from: initial, draft: initial });
      setSynced(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, synced]);

  const items = useMemo(() => draft?.items ?? [], [draft]);
  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const strips = useMemo(() => (draft ? stripsAt(draft, bed, year, day) : []), [draft, bed, year, day]);
  const rows = useMemo(() => layoutRows(strips), [strips]);
  const reorderable = rowsReorderable(rows) && !strips.some((x) => x.fixed);
  const placed = useMemo(() => placedInBed(items, bed), [items, bed]);
  const groupCode = (id: number | null) => groups.find((g) => g.id === id)?.code ?? null;

  // Ellenőrzések a piszkozattal: a mentett változatok helyett a szerkesztettek számítanak
  const ctx: ChecksContext | null = useMemo(
    () =>
      checksCtx && draft
        ? {
            ...checksCtx,
            all: [...checksCtx.all.filter((p) => !byId.has(p.id) && !draft.deleted.includes(p.id)), ...items],
          }
        : null,
    [checksCtx, draft, byId, items],
  );
  const issues = useMemo(() => {
    if (!ctx) return new Map<number, PlantingIssue[]>();
    const mine = items.filter((p) => p.year === year && p.status !== 'elmaradt');
    const list = mine.flatMap((p) => [
      ...rotationChecks(p, ctx),
      ...companionChecks(p, ctx).map((h) => companionIssue(p, h)),
      ...plantingDetailChecks(p, ctx),
    ]);
    const out = Map.groupBy(list, (i) => i.plantingId);
    for (const v of out.values()) v.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
    return out;
  }, [ctx, items, year]);

  const rawClashes = useMemo(() => findClashes(placed), [placed]);
  const clashes: ClashView[] = useMemo(
    () =>
      rawClashes.map((c) => {
        const a = byId.get(c.a)!;
        const b = byId.get(c.b)!;
        return { key: `${c.a}-${c.b}`, a, b, start: c.period.start, end: c.period.end, fixes: clashFixes(a, b) };
      }),
    [rawClashes, byId],
  );
  /** Kerülendő és figyelmeztető jelzések az év ültetéseire (páronként egyszer) */
  const warnings = useMemo(
    () => uniqueIssues([...issues.values()].flat()).filter((i) => i.level === 'kerulendo' || i.level === 'figyelem'),
    [issues],
  );
  /** Hány sávnál van kerülendő jelzés (ütközéssel együtt): a mentés-sáv mutatja */
  const avoidCount = useMemo(() => {
    const ids = new Set(warnings.filter((i) => i.level === 'kerulendo').map((i) => i.plantingId));
    for (const c of clashes) ids.add(c.a.id).add(c.b.id);
    return ids.size;
  }, [warnings, clashes]);

  const gapsAt = (d: string) => freeOnDay(placed, size, d);
  const gaps = useMemo(() => freeOnDay(placed, size, day), [placed, size, day]);

  // --- Megjelenítés ---------------------------------------------------------------

  const canvasStrips: CanvasStrip[] = strips.map((x) => {
    const p = byId.get(x.key)!;
    return {
      ...x,
      label: `${p.plant_name} · ${nf.format(x.placement.axis_span_cm)} cm`,
      color: cropColor(p.crop_group_code),
      issue: worstLevel(issues.get(x.key)),
    };
  });
  const canvasBoundaries: CanvasBoundary[] = ctx
    ? stripBoundaries(strips).flatMap((b) => {
        const rel = relationOf(ctx.companions, byId.get(b.a)!.plant_id, byId.get(b.b)!.plant_id);
        return rel && rel.relation !== 0 ? [{ ...b, relation: rel.relation, reason: rel.reason }] : [];
      })
    : [];
  const selectedId = selection.kind === 'strip' ? selection.id : null;
  const sel = selectedId != null ? byId.get(selectedId) : undefined;
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
  const canvasGaps: CanvasGap[] = gaps.map((g) => ({
    ...g,
    selected: selection.kind === 'gap' && selection.start === g.start && selection.end === g.end,
  }));
  const previews = Object.fromEntries(
    LAYOUT_PHASES.map((phase) => [
      phase,
      draft ? stripsAt(draft, bed, year, days[phase]).map((x) => ({ placement: x.placement, color: cropColor(byId.get(x.key)?.crop_group_code) })) : [],
    ]),
  ) as Record<LayoutPhase, PhasePreview>;
  /** A napon foglalt terület aránya (0–1) */
  const usage = (d: string) => {
    if (!draft) return 0;
    const used = stripsAt(draft, bed, year, d).reduce((sum, x) => sum + x.placement.axis_span_cm * x.placement.cross_span_cm, 0);
    return Math.min(1, used / (size.axis * size.cross));
  };
  /** Az év elhelyezésre váró ültetései: nincs helyük vagy dátumuk, így az ágyásképen nem látszanak */
  const unplaced = items.filter((p) => p.year === year && p.status !== 'elmaradt' && !placed.some((o) => o.id === p.id));

  // --- Kijelölés és nap ----------------------------------------------------------------

  /** Az ültetés napja: ha a választott napon nem áll az ágyásban, a pillanatkép az ágyásba kerülésére ugrik. */
  const showOnDay = (p: PlantingListItem) => {
    const period = occupancyPeriod(p);
    if (period && !(period.start <= day && day < period.end)) setDayState(maxISO(period.start, `${year}-01-01`));
  };

  const setDay = (d: string) => {
    setDayState(d);
    setNotice(null);
    setSelection((cur) => {
      if (cur.kind === 'gap') return NONE;
      if (cur.kind !== 'strip') return cur;
      // a kijelölt sáv marad, ha az új napon is az ágyásban áll
      const period = byId.get(cur.id) && occupancyPeriod(byId.get(cur.id)!);
      return period && period.start <= d && d < period.end ? cur : NONE;
    });
  };

  const selectStrip = (id: number | null) => {
    setNotice(null);
    setSelection(id == null ? NONE : { kind: 'strip', id });
  };

  /** Kijelölés és a nap odaállítása (áttekintés, idővonal, lista, belépési hivatkozás). */
  const showPlanting = (id: number) => {
    const p = byId.get(id);
    if (!p) return;
    showOnDay(p);
    selectStrip(id);
  };

  const selectGap = (index: number) => {
    const g = gaps[index];
    setNotice(null);
    if (g) setSelection({ kind: 'gap', start: g.start, end: g.end });
  };

  // --- Műveletek -----------------------------------------------------------------------

  /**
   * A piszkozat módosítása egy művelettel; ha nem lehetséges (null), az üzenet jelenik meg, egyébként
   * a korábbi üzenet eltűnik. Mentés közben nincs módosítás (a munkalap zárolva van).
   */
  const update = (fn: (d: LayoutDraft) => LayoutDraft | null, failMessage?: string): boolean => {
    if (!session || save.isPending) return false;
    const next = fn(session.draft);
    if (!next) {
      if (failMessage) setNotice(failMessage);
      return false;
    }
    setNotice(null);
    setSession({ ...session, draft: next });
    return true;
  };
  const withStrips = (next: LayoutStrip[] | null) => (d: LayoutDraft) => (next ? applyStrips(d, next, bed) : null);

  /** Húzás az ágyásképen: az üzenet marad (az eltűnése a képet a mutató alatt elmozdítaná). */
  const drag = (next: LayoutStrip[]) => {
    if (save.isPending) return;
    setSession((cur) => cur && { ...cur, draft: applyStrips(cur.draft, next, bed) });
  };

  /** Változtat-e a sávokon a művelet eredménye (a határon a léptetés változatlan kiosztást ad). */
  const changesStrips = (next: LayoutStrip[] | null) => {
    if (!next) return false;
    const before = new Map(strips.map((x) => [x.key, x.placement]));
    return next.some((x) => {
      const p = before.get(x.key);
      return !p || !samePlacement(p, x.placement);
    });
  };

  /**
   * Az új vagy másolt ültetés elhelyezése az `insertPlacement` szabálya szerint. A napi hely és a
   * helycsinálás azt a napot nézi, amikor az új ültetés az ágyásban áll: a választottat, vagy ha
   * akkor még (már) nincs ott, az ágyásba kerülését.
   */
  const insert = (item: PlantingListItem, atEnd = false) => {
    const ok = update((d) => {
      const period = occupancyPeriod(item);
      const on = period && !(period.start <= day && day < period.end) ? maxISO(period.start, `${year}-01-01`) : day;
      const res = insertPlacement({
        size,
        span: item.axis_span_cm ?? 30,
        period,
        on,
        occupants: placedInBed(d.items, bed),
        strips: on === day ? strips : stripsAt(d, bed, year, on),
        selected: selectedId,
        atEnd,
      });
      if (!res) return null;
      const room = res.strips ? applyStrips(d, res.strips, bed) : d;
      // az addItem lépteti a következő azonosítót is; a hely nélküli új ültetést az applyStrips helyezi el
      return applyStrips(addItem(room, item), [{ key: item.id, placement: res.placement }], bed);
    }, NO_ROOM);
    if (ok) {
      showOnDay(item);
      selectStrip(item.id);
    }
  };

  const newFor = (plantId: number, id: number) => {
    const plant = plants.find((p) => p.id === plantId);
    return plant ? plantingFor(plant, { id, year, bedId: bed.id, day, frost, cropGroupCode: groupCode(plant.crop_group_id) }) : null;
  };

  /** Bármelyik növény felvétele (a keresőből, ha a javaslatok között nincs): az új sáv szabálya szerint. */
  const addPlant = (plantId: number) => {
    if (!draft) return;
    const item = newFor(plantId, draft.nextId);
    if (item) insert(item);
    else setNotice(PLANTS_LOADING);
  };

  /** A javaslat felvétele: a helye a teljes időszakára szabad, így más sáv nem mozdul. */
  const addSuggestion = (sg: Suggestion) => {
    if (!draft) return;
    const stock = seeds.find((x) => x.id === sg.seed_stock_id);
    const item = plantingFromSuggestion(sg, {
      id: draft.nextId,
      year,
      bedId: bed.id,
      cropGroupCode: groupCode(sg.plant.crop_group_id),
      seedVintage: stock?.vintage_year ?? null,
      bed,
    });
    if (update((d) => addItem(d, item))) {
      showOnDay(item);
      selectStrip(item.id);
    }
  };

  const duplicate = (key: number) => {
    const p = byId.get(key);
    if (!p || !draft) return;
    // A másolat hely híján az utolsó sor után kerül: így lesz paradicsom–bazsalikom–paradicsom
    insert({ ...copyPlanting(p, draft.nextId), axis_span_cm: placementOf(p, bed)?.axis_span_cm ?? p.axis_span_cm }, true);
  };

  const split = (key: number) => {
    if (!draft) return;
    const newId = draft.nextId;
    const ok = update((d) => {
      const p = d.items.find((x) => x.id === key);
      const next = splitStrip(strips, key, d.nextId);
      if (!p || !next) return null;
      return applyStrips(addItem(d, copyPlanting(p, d.nextId)), next, bed);
    }, 'A szétvágáshoz a sávnak legalább 20 cm hosszúnak kell lennie.');
    if (ok) selectStrip(newId);
  };

  const remove = (key: number) => {
    const p = byId.get(key);
    if (!p) return;
    if (isFixed(p, year)) {
      setNotice('Ez az ültetés már elkezdődött vagy más évhez tartozik: a részletes lapon módosítható vagy törölhető.');
      return;
    }
    if (update((d) => removeItem(d, key))) setSelection(NONE);
  };

  /** Új sáv növényének cseréje: a hely marad, a dátumok és a sorszám az új növényé. */
  const changePlant = (key: number, plantId: number) => {
    let fresh: PlantingListItem | null = null;
    const ok = update((d) => {
      const old = d.items.find((x) => x.id === key);
      const where = old ? placementOf(old, bed) : null;
      fresh = newFor(plantId, key);
      if (!where || !fresh) return null;
      return applyStrips(replaceItem(d, fresh), [{ key, placement: where }], bed);
    }, PLANTS_LOADING);
    if (ok && fresh) showOnDay(fresh);
  };

  /** A sor hossza mentén: a kezdete (mozgatás) vagy a hossza (a vége mozdul). */
  const crossStep = (key: number, field: 'start' | 'span', delta: number) =>
    field === 'start'
      ? moveStrip(strips, key, { axis: 0, cross: delta }, size)
      : resizeStrip(strips, key, ['crossEnd'], { axis: 0, cross: delta }, size);
  const stepCross = (key: number, field: 'start' | 'span', delta: number) => update(withStrips(crossStep(key, field, delta)));
  const canStepCross = (key: number, field: 'start' | 'span', delta: number) => changesStrips(crossStep(key, field, delta));

  const resizeRowAt = (index: number, delta: number) => {
    const row = rows[index];
    if (!row) return;
    update(
      withStrips(resizeRow(strips, row, delta, size)),
      delta < 0 ? 'Ennél keskenyebb nem lehet a sor.' : 'Ennél a sornál nincs több hely: előbb keskenyíts egy másikat.',
    );
  };
  /** A sáv sorának szélessége (a panel léptetője) */
  const resizeStripRow = (key: number, delta: number) => resizeRowAt(rows.findIndex((r) => r.keys.includes(key)), delta);
  const canResizeStripRow = (key: number, delta: number) => {
    const row = rows.find((r) => r.keys.includes(key));
    return !!row && changesStrips(resizeRow(strips, row, delta, size));
  };
  const moveRowAt = (from: number, to: number) => update(withStrips(moveRow(strips, rows, from, to)));
  const fix = (f: ClashFix) => update((d) => applyFix(d, f));

  /** Hely kijelölése egy elhelyezésre váró ültetésnek (dátum nélkül nem lehet). */
  const placeUnplaced = (id: number) => {
    const p = byId.get(id);
    if (!p) return;
    const period = occupancyPeriod(p);
    if (!period) {
      setNotice('Ennek az ültetésnek nincs dátuma: előbb a Részletek lapon add meg, mikor kerül az ágyásba.');
      return;
    }
    const span = p.axis_span_cm ?? spanForRows(p.rows ?? 1, p.row_spacing_cm);
    const ok = update((d) => {
      const on = !(period.start <= day && day < period.end) ? maxISO(period.start, `${year}-01-01`) : day;
      const res = insertPlacement({
        size,
        span,
        period,
        on,
        occupants: placedInBed(d.items, bed),
        strips: on === day ? strips : stripsAt(d, bed, year, on),
        selected: selectedId,
      });
      if (!res) return null;
      const room = res.strips ? applyStrips(d, res.strips, bed) : d;
      return applyStrips(room, [{ key: id, placement: res.placement }], bed);
    }, NO_ROOM);
    if (ok) {
      showOnDay(p);
      selectStrip(id);
    }
  };

  // --- Mentés -------------------------------------------------------------------------

  /** Mentés; a siker után az új sávok azonosítója a `then`-nek adott függvénnyel kérdezhető le. */
  const commit = (then?: (idOf: (id: number) => number) => void) => {
    if (!session || !batch || !dirty || save.isPending) return;
    // a szerver a létrehozott azonosítókat a küldés sorrendjében adja vissza (mint a `toBatch`)
    const creates = session.draft.items.filter((p) => p.id < 0).map((p) => p.id);
    save.mutate(batch, {
      onSuccess: (res) => {
        const idOf = (id: number) => (id < 0 ? (res.created[creates.indexOf(id)] ?? id) : id);
        setSelection((cur) => (cur.kind === 'strip' ? { kind: 'strip', id: idOf(cur.id) } : cur));
        setNotice(null);
        setSynced(false);
        then?.(idOf);
      },
      onError: (e) => setNotice(errorMessage(e)),
    });
  };

  /** Minden módosítás elvetése: a mentett állapot. */
  const discard = () => {
    if (save.isPending) return;
    setSelection((cur) => (cur.kind === 'strip' && (cur.id < 0 || !initial?.items.some((p) => p.id === cur.id)) ? NONE : cur));
    setNotice(null);
    setSynced(false);
    if (initial) setSession({ from: initial, draft: initial });
  };

  /** Részletes lap: ha van mentetlen módosítás, előbb ment (az új sáv így kap azonosítót). */
  const openDetails = (id: number) => {
    if (save.isPending) return;
    if (!dirty) setDetailsId(id);
    else commit((idOf) => setDetailsId(idOf(id)));
  };
  const closeDetails = () => {
    setDetailsId(null);
    setSynced(false);
  };

  return {
    loaded: !!draft,
    bed,
    year,
    size,
    days,
    day,
    setDay,
    selection,
    setSelection: (s: Selection) => {
      setNotice(null);
      setSelection(s);
    },
    selectStrip,
    selectGap,
    showPlanting,
    items,
    byId,
    strips,
    rows,
    reorderable,
    gaps,
    gapsAt,
    canvasStrips,
    canvasBoundaries,
    canvasGaps,
    rowStrips,
    linkedIds,
    previews,
    usage,
    unplaced,
    ctx,
    issues,
    warnings,
    clashes,
    placed,
    rawClashes,
    frost,
    avoidCount,
    plants,
    seeds,
    groupCode,
    notice,
    setNotice,
    // műveletek
    drag,
    addSuggestion,
    addPlant,
    duplicate,
    split,
    remove,
    changePlant,
    stepCross,
    canStepCross,
    resizeRowAt,
    resizeStripRow,
    canResizeStripRow,
    moveRowAt,
    fix,
    placeUnplaced,
    // mentés
    dirty,
    changes,
    saving: save.isPending,
    commit,
    discard,
    detailsId,
    openDetails,
    closeDetails,
    plantings,
  };
}

export type BedWorkspaceState = ReturnType<typeof useBedWorkspace>;
