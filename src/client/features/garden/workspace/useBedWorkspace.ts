import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { LAYOUT_PHASES, type LayoutPhase } from '@shared/labels.ts';
import { relationOf } from '@shared/domain/companions.ts';
import { bedAxes, findClashes, placementsOverlap, spanForRows, type Period } from '@shared/domain/geometry.ts';
import { diffDays, maxISO } from '@shared/domain/isoDate.ts';
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
import type { Suggestion, SuggestionTarget } from '@shared/domain/suggestions.ts';
import { DEFAULT_SETTINGS } from '@shared/settings.ts';
import type { PlantingBatchInput } from '@shared/schemas.ts';
import type { Bed, PlantingListItem } from '@shared/types.ts';
import { api, ApiError } from '../../../lib/api.ts';
import { cropColor } from '../../../lib/cropColors.ts';
import { errorMessage } from '../../../lib/errors.ts';
import { todayISO } from '../../../lib/format.ts';
import { qk, useApiMutation, useCropGroups, usePlantings, usePlants, useSeeds, useSettings } from '../../../lib/queries.ts';
import { defaultRows } from '../../plan/plantingForm.ts';
import { placedInBed, plantingTitle, type PlacedPlanting } from '../../plan/plantingView.ts';
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
  editPlan,
  followSuccession,
  isDraftSeries,
  isFixed,
  plantingFor,
  plantingFromSuggestion,
  pruneSeries,
  removeItem,
  replaceWith,
  seriesMembers,
  setSuccession,
  stripsAt,
  successionOf,
  toBatch,
  type LayoutDraft,
  type Succession,
} from '../layoutDraft.ts';

/** Mire vonatkozik a panel. */
export type Selection =
  | { kind: 'none' }
  /** A napon szabad szakasz a tengely mentén: javaslat oda */
  | { kind: 'gap'; start: number; end: number }
  /** Új sáv („+ Új sáv”): szabad hely híján az `after` sáv (ennek híján az utolsó sor) mellé kerül */
  | { kind: 'new'; after: number | null }
  | { kind: 'strip'; id: number }
  /** Javaslat a sáv helyére: előtte (elővetemény), utána, vagy helyette */
  | { kind: 'before' | 'after' | 'replace'; id: number };

/** A javaslatlista fajtája: szabad hely, új sáv (szabad hellyel vagy beszúrással), a sáv előtt, után, helyette. */
export type SuggestMode = 'gap' | 'new' | 'insert' | 'before' | 'after' | 'replace';

/** A panel javaslatlistájának kérése: a javaslatmotor célja és az ellenőrzések, amelyekkel számol. */
export interface SuggestRequest {
  mode: SuggestMode;
  /** A motor célja (az ágyás, az év és a mai nap nélkül); null: sehogy sincs hely */
  target: Omit<SuggestionTarget, 'bed' | 'year' | 'today'> | null;
  /** Beszúrásnál a helycsinálás utáni kiosztással */
  ctx: ChecksContext;
  /** A sáv, amelynek a helyére (elé, után, helyette) a javaslat szól */
  strip?: PlantingListItem;
  /** Beszúrásnál ez után kerül az új sor (null: a végére) */
  after?: PlantingListItem | null;
}

/** „Ezen a helyen [év]”: a sáv helyén előtte és utána álló ültetések és a szabad idő. */
export interface PlaceChain {
  own: PlacedPlanting;
  before: PlacedPlanting[];
  after: PlacedPlanting[];
  freeBefore: Period | null;
  freeAfter: Period | null;
}

const NONE: Selection = { kind: 'none' };
/** A beszúrási javaslat névleges szélessége (a szomszédok megállapításához; a valódi a növényé) */
const NOMINAL_CM = 30;
/** Ennyi szabad nap alatt nem kínál elő- vagy utóveteményt */
const MIN_FREE_DAYS = 14;
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
  // A piszkozat a mentett állapotból indul: nyitáskor, mentés és elvetés után, és a Tény és napló lap után
  const [synced, setSynced] = useState(false);
  const [selection, setSelection] = useState<Selection>(NONE);
  const [notice, setNotice] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  // A tervezési adatok változása a kapcsolt sávokra is átkerül (sávonként, alapból be)
  const [linkOn, setLinkOn] = useState(true);
  // A mentés nem lehetséges, mert egy módosított ültetést közben máshol (pl. telefonon) töröltek
  const [conflict, setConflict] = useState(false);
  const queryClient = useQueryClient();

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
    // Ha a mentett állapot közben kívülről változott (pl. a Tény és napló lapon), és a piszkozatban
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

  // A kijelölt ültetés a friss mentett állapotban már nincs meg (pl. a Tény és napló lapon
  // törölték): a panel az áttekintésre vált. Csak szinkron piszkozatnál, mert mentés után a
  // kijelölés már az új azonosítóra mutat, mielőtt a piszkozat a mentett állapotra frissülne.
  useEffect(() => {
    if (!session || !synced || session.from !== initial) return;
    if ('id' in selection && !byId.has(selection.id)) setSelection(NONE);
  }, [session, synced, initial, selection, byId]);
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
  /** A kijelölt sáv (a helyére kért javaslatnál is) */
  const selectedId = 'id' in selection ? selection.id : null;
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

  /** „Ezen a helyen [év]”: ami a sáv helyén előtte és utána áll, és a szabad idő közvetlenül előtte és utána. */
  const placeChain = (id: number): PlaceChain | null => {
    const own = placed.find((o) => o.id === id);
    if (!own) return null;
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;
    const same = placed.filter(
      (o) => o.id !== id && placementsOverlap(o.placement, own.placement) && o.period.start < yearEnd && o.period.end > yearStart,
    );
    const byStartDay = (a: PlacedPlanting, b: PlacedPlanting) => a.period.start.localeCompare(b.period.start);
    const before = same.filter((o) => o.period.end <= own.period.start).sort(byStartDay);
    const after = same.filter((o) => o.period.start >= own.period.end).sort(byStartDay);
    const from = before.reduce((d, o) => maxISO(d, o.period.end), yearStart);
    const to = after[0]?.period.start ?? yearEnd;
    const roomy = (a: string, b: string) => a < b && diffDays(a, b) >= MIN_FREE_DAYS;
    return {
      own,
      before,
      after,
      freeBefore: own.period.start > yearStart && roomy(from, own.period.start) ? { start: from, end: own.period.start } : null,
      freeAfter: own.period.end < yearEnd && roomy(own.period.end, to) ? { start: own.period.end, end: to } : null,
    };
  };

  // A panel javaslatlistájának kérése a kijelölésből
  const request: SuggestRequest | null = useMemo(() => {
    if (!ctx || !draft) return null;
    const from = `${year}-01-01`;
    const around = (id: number) => {
      const p = byId.get(id);
      const pl = p && placementOf(p, bed);
      const period = p && occupancyPeriod(p);
      if (!p || !pl || !period) return null;
      const cross = isFullLength(pl, size.cross) ? null : { start: pl.cross_start_cm, span: pl.cross_span_cm };
      return { p, period, base: { strip: { start: pl.axis_start_cm, span: pl.axis_span_cm }, cross, fill: true, whole: true } };
    };
    switch (selection.kind) {
      case 'gap':
        return {
          mode: 'gap',
          ctx,
          target: { strip: { start: selection.start, span: selection.end - selection.start }, cross: null, from, day, fill: false },
        };
      case 'new': {
        if (gaps.length) return { mode: 'new', ctx, target: { strip: null, cross: null, from, day, fill: false } };
        // Szabad hely nélkül: a kijelölt (ennek híján az utolsó) sor után, a többi sor arányos engedésével
        const after = selection.after != null && strips.some((x) => x.key === selection.after) ? selection.after : null;
        const res = insertPlacement({ size, span: NOMINAL_CM, period: null, on: day, occupants: placed, strips, selected: after });
        const afterItem = after != null ? byId.get(after) : rows.length ? byId.get(rows[rows.length - 1]!.keys[0]!) : null;
        if (!res) return { mode: 'insert', ctx, target: null, after: afterItem ?? null };
        const moved = res.strips ? applyStrips(draft, res.strips, bed) : draft;
        const insertCtx = { ...ctx, all: [...ctx.all.filter((p) => !byId.has(p.id)), ...moved.items] };
        return {
          mode: 'insert',
          ctx: insertCtx,
          target: { strip: null, cross: null, from, day, place: res.placement },
          after: afterItem ?? null,
        };
      }
      case 'before': {
        const a = around(selection.id);
        return a && { mode: 'before', ctx, strip: a.p, target: { ...a.base, from, until: a.period.start } };
      }
      case 'after': {
        const a = around(selection.id);
        return a && { mode: 'after', ctx, strip: a.p, target: { ...a.base, from: maxISO(from, a.period.end) } };
      }
      case 'replace': {
        const a = around(selection.id);
        return a && { mode: 'replace', ctx, strip: a.p, target: { ...a.base, from, day, excludeId: a.p.id } };
      }
      default:
        return null;
    }
  }, [ctx, draft, year, day, selection, byId, bed, size, gaps, strips, rows, placed]);

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
      // az elő- és utóvetemény a sáv idejéhez igazodik, nem a naphoz
      if (cur.kind !== 'strip' && cur.kind !== 'replace') return cur;
      // a kijelölt sáv marad, ha az új napon is az ágyásban áll
      const period = byId.get(cur.id) && occupancyPeriod(byId.get(cur.id)!);
      return period && period.start <= d && d < period.end ? cur : NONE;
    });
  };

  const selectStrip = (id: number | null) => {
    setNotice(null);
    // másik sávnál a kapcsolt sávok követése újra alapállásban
    if (id !== selectedId) setLinkOn(true);
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
  const update = (fn: (d: LayoutDraft) => LayoutDraft | null, failMessage?: string | (() => string)): boolean => {
    if (!session || save.isPending) return false;
    const next = fn(session.draft);
    if (!next) {
      if (failMessage) setNotice(typeof failMessage === 'function' ? failMessage() : failMessage);
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
  const insert = (item: PlantingListItem, opts: { atEnd?: boolean; after?: number | null } = {}) => {
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
        selected: opts.after !== undefined ? opts.after : selectedId,
        atEnd: opts.atEnd,
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
  const addPlant = (plantId: number, after?: number | null) => {
    if (!draft) return;
    const item = newFor(plantId, draft.nextId);
    if (item) insert(item, { after });
    else setNotice(PLANTS_LOADING);
  };

  const fromSuggestion = (sg: Suggestion, id: number) => {
    const stock = seeds.find((x) => x.id === sg.seed_stock_id);
    return plantingFromSuggestion(sg, {
      id,
      year,
      bedId: bed.id,
      cropGroupCode: groupCode(sg.plant.crop_group_id),
      seedVintage: stock?.vintage_year ?? null,
      bed,
    });
  };

  /** Beszúrási javaslat (szabad hely nélkül): a növény alapszélességével, a többi sor arányosan enged. */
  const insertSuggestion = (sg: Suggestion, after: number | null) => {
    if (!draft) return;
    const rows = defaultRows(sg.plant.row_spacing_cm);
    insert(
      {
        ...fromSuggestion(sg, draft.nextId),
        rows,
        axis_span_cm: spanForRows(rows, sg.plant.row_spacing_cm),
        axis_start_cm: null,
        cross_start_cm: null,
        cross_span_cm: null,
      },
      { after },
    );
  };

  /** A javaslat felvétele: a helye a teljes időszakára szabad, így más sáv nem mozdul. */
  const addSuggestion = (sg: Suggestion) => {
    if (!draft) return;
    const item = fromSuggestion(sg, draft.nextId);
    if (update((d) => addItem(d, item))) {
      showOnDay(item);
      selectStrip(item.id);
    }
  };

  const duplicate = (key: number) => {
    const p = byId.get(key);
    if (!p || !draft) return;
    // A másolat hely híján az utolsó sor után kerül: így lesz paradicsom–bazsalikom–paradicsom
    insert({ ...copyPlanting(p, draft.nextId), axis_span_cm: placementOf(p, bed)?.axis_span_cm ?? p.axis_span_cm }, { atEnd: true });
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
      setNotice('Ez az ültetés már elkezdődött vagy más évhez tartozik: a Tény és napló lapon törölhető.');
      return;
    }
    // a piszkozatban indított újravetés tagjai a fejjel együtt mennek; egy tag kiesése után a sorozat rendbe jön
    if (update((d) => pruneSeries(removeItem(headless(d, key), key)))) setSelection(NONE);
  };

  /** A piszkozatban indított újravetés fejénél előbb a tagok kikerülnek (a sáv cseréje vagy törlése előtt). */
  const headless = (d: LayoutDraft, key: number) => {
    const p = d.items.find((x) => x.id === key);
    return p && isDraftSeries(p) && p.series_index === 1 ? setSuccession(d, key, null, bed) : d;
  };

  /**
   * Csere ugyanott: a hely és a szélesség marad (ha van), a többi (dátumok, sorszám) az új ültetésé. Az
   * azonosító is marad (`replaceWith`), így a mentett ültetés naplókapcsolata és feladatai sem vesznek
   * el; a csere kijelölődik.
   */
  const replaceBy = (key: number, make: (id: number) => PlantingListItem | null) => {
    let made: PlantingListItem | null = null;
    let fail = PLANTS_LOADING;
    const ok = update(
      (d) => {
        const old = d.items.find((x) => x.id === key);
        const where = old ? placementOf(old, bed) : null;
        if (!old || isFixed(old, year)) {
          fail = 'Megkezdett vagy rögzített ültetés nem cserélhető: a Tény és napló lapon módosítható.';
          return null;
        }
        const item = make(key);
        if (!item) return null;
        made = item;
        const replaced = replaceWith(headless(d, key), key, item);
        // hely nélküli (elhelyezésre váró) ültetésnél csak a növény és a terv cserélődik
        return where ? applyStrips(replaced, [{ key, placement: where }], bed) : replaced;
      },
      () => fail,
    );
    if (ok && made) {
      showOnDay(made);
      setNotice(null);
      setSelection({ kind: 'strip', id: key });
    }
  };
  /** Másik növény ugyanott, a vetési naptár szerint (a nap ablakából). */
  const changePlant = (key: number, plantId: number) => replaceBy(key, (id) => newFor(plantId, id));
  /** „Mi kerülhetne ide helyette?” választása. */
  const replaceWithSuggestion = (key: number, sg: Suggestion) => replaceBy(key, (id) => fromSuggestion(sg, id));

  /**
   * A tervezési adatok módosítása a panelről (fajta, vetőmag, időszak, módszer, dátumok, tőszám,
   * megjegyzés): bekapcsolt követésnél a kapcsolt sávokra is átkerül; a piszkozatban indított
   * újravetés tagjai a fej új adataiból újraképződnek.
   */
  const editPlanting = (next: PlantingListItem) =>
    update((d) => {
      const before = d.items.find((x) => x.id === next.id);
      const edited = editPlan(d, next, linkOn);
      return before ? followSuccession(edited, before, next) : edited;
    });

  /** A sorok száma (a szélesség marad); ez lesz a sáv saját sűrűsége a további méretezéshez. */
  const setRows = (key: number, rows: number) =>
    update((d) => {
      const p = d.items.find((x) => x.id === key);
      if (!p || p.rows === rows) return null;
      const next = { ...p, rows };
      const rowBase = next.axis_span_cm ? { ...d.rowBase, [key]: { span: next.axis_span_cm, rows } } : d.rowBase;
      return { ...editPlan(d, next, false), rowBase };
    });

  /** Újravetés be- és kikapcsolása, a vetések száma és időköze (a fej a kijelölt sáv). */
  const setSeries = (key: number, s: Succession | null) =>
    update((d) => {
      const next = setSuccession(d, key, s, bed);
      return next === d && s ? null : next;
    }, 'Az újravetéshez a sávnak hely és dátum kell.');

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

  /** A javaslatlista választása a kérés szerint: szabad helyre, beszúrással vagy cserével. */
  const pickSuggestion = (sg: Suggestion) => {
    if (!request) return;
    if (request.mode === 'insert') insertSuggestion(sg, request.after?.id ?? null);
    else if (request.mode === 'replace' && request.strip) replaceWithSuggestion(request.strip.id, sg);
    else addSuggestion(sg);
  };
  /** A keresőben talált, a javaslatok közé nem férő növény (szabad helyre, beszúrással vagy cserével). */
  const pickPlant = (plantId: number) => {
    if (!request) return;
    if (request.mode === 'replace' && request.strip) changePlant(request.strip.id, plantId);
    else if (request.mode === 'insert') addPlant(plantId, request.after?.id ?? null);
    else addPlant(plantId);
  };

  /** Hely kijelölése egy elhelyezésre váró ültetésnek (dátum nélkül nem lehet). */
  const placeUnplaced = (id: number) => {
    const p = byId.get(id);
    if (!p) return;
    const period = occupancyPeriod(p);
    if (!period) {
      setNotice('Ennek az ültetésnek nincs dátuma: előbb a panelen add meg, mikor kerül az ágyásba („Dátum megadása”).');
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
        setSelection((cur) => ('id' in cur ? { ...cur, id: idOf(cur.id) } : cur));
        setNotice(null);
        setConflict(false);
        setSynced(false);
        then?.(idOf);
      },
      onError: (e) => {
        // a módosított ültetés már nincs meg: a mentés ismételve sem sikerülne
        if (e instanceof ApiError && e.status === 404) setConflict(true);
        else setNotice(errorMessage(e));
      },
    });
  };

  /** Minden módosítás elvetése: a mentett állapot. */
  const discard = () => {
    if (save.isPending) return;
    setSelection((cur) => ('id' in cur && (cur.id < 0 || !initial?.items.some((p) => p.id === cur.id)) ? NONE : cur));
    setNotice(null);
    setConflict(false);
    setSynced(false);
    if (initial) setSession({ from: initial, draft: initial });
  };

  /** Mentési ütközés után: a módosítások elvetése és a mentett állapot újratöltése. */
  const discardAndRefresh = () => {
    discard();
    setSelection(NONE);
    void queryClient.invalidateQueries({ queryKey: qk.plantings });
  };

  /** Tény és napló lap: ha van mentetlen módosítás, előbb ment (az új sáv így kap azonosítót). */
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
    setSelection: (next: Selection) => {
      setNotice(null);
      setSelection(next);
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
    placeChain,
    request,
    /** A piszkozatban indított újravetés beállítása a fejből */
    succession: (id: number) => (draft ? successionOf(draft, id) : null),
    /** A sorozat tagjai sorszám szerint */
    seriesOf: (p: PlantingListItem) => (draft ? seriesMembers(draft, p) : [p]),
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
    pickSuggestion,
    pickPlant,
    addSuggestion,
    addPlant,
    duplicate,
    split,
    remove,
    changePlant,
    editPlanting,
    setRows,
    setSeries,
    linkOn,
    setLinkOn,
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
    conflict,
    discardAndRefresh,
    detailsId,
    openDetails,
    closeDetails,
    plantings,
  };
}

export type BedWorkspaceState = ReturnType<typeof useBedWorkspace>;
