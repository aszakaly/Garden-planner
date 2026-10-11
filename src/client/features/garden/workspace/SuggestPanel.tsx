import { Plus, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { endOf } from '@shared/domain/layout.ts';
import { occupancyPeriod, placementOf } from '@shared/domain/plantings.ts';
import { capitalize, withArticle } from '@shared/text.ts';
import { suggestPlantings, SUGGESTION_RANK_LABEL, SUGGESTION_RANKS, type Suggestion, type SuggestionRank } from '@shared/domain/suggestions.ts';
import { cropColor } from '../../../lib/cropColors.ts';
import { formatDay, todayISO } from '../../../lib/format.ts';
import { SuggestionRow } from '../../plan/SuggestionRow.tsx';
import { PanelGroup, PanelHead } from './PanelParts.tsx';
import { fromDay, untilDay } from './panelText.ts';
import type { BedWorkspaceState } from './useBedWorkspace.ts';
import s from './Workspace.module.css';

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
/** Ennyi javaslat látszik csoportonként, amíg nincs keresés */
const SHOWN: Record<SuggestionRank, number> = { ajanlott: 6, lehetseges: 4, kerulendo: 0 };
/** Kis- és nagybetű, valamint ékezet nélküli összevetés a kereséshez */
const fold = (t: string) => t.toLocaleLowerCase('hu').normalize('NFD').replace(/\p{Diacritic}/gu, '');
const lower = (t: string) => t.toLocaleLowerCase('hu');

interface Props {
  ws: BedWorkspaceState;
  /** Előnézet az ágyásképen: a fölé vitt vagy fókuszban lévő javaslat */
  onPreview: (sg: Suggestion | null) => void;
}

/**
 * Javaslatlista a kijelöléshez: szabad hely, új sáv (szabad hely híján beszúrással), a sáv előtt
 * (elővetemény), utána, vagy helyette. Rangsorolt javaslatok kereséssel; egy kattintással a helyére
 * kerülnek. A keresőben a javaslatok közé nem férő növény is felvehető (elő- és utóveteménynél nem).
 */
export function SuggestPanel({ ws, onPreview }: Props) {
  const { bed, year, day, request, plants, seeds } = ws;
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<SuggestionRank>>(new Set());

  const suggestions = useMemo(() => {
    if (!request?.target || !plants.length) return request && !request.target ? [] : null;
    const skip = request.mode === 'replace' ? request.strip?.plant_id : undefined;
    return suggestPlantings({
      target: { ...request.target, bed, year, today: todayISO() },
      plants: skip ? plants.filter((p) => p.id !== skip) : plants,
      seeds,
      ctx: request.ctx,
    });
  }, [request, plants, seeds, bed, year]);

  if (!request) return null;
  const { mode, strip, target } = request;
  const back = mode === 'before' || mode === 'after' || mode === 'replace';
  const place = strip && placementOf(strip, bed);
  const period = strip && occupancyPeriod(strip);
  const range = place ? `${nf.format(place.axis_start_cm)}–${nf.format(endOf(place, 'axis'))} cm` : '';
  const name = strip ? withArticle(lower(strip.plant_name)) : '';

  // A szabad hely két szomszédja a napon
  const gap = ws.selection.kind === 'gap' ? ws.selection : null;
  const neighbours = gap
    ? ws.strips
        .filter((x) => Math.abs(endOf(x.placement, 'axis') - gap.start) < 0.5 || Math.abs(x.placement.axis_start_cm - gap.end) < 0.5)
        .map((x) => ws.byId.get(x.key)?.plant_name.toLocaleLowerCase('hu'))
        .filter(Boolean)
    : [];

  const head: { kicker: string; title: string; meta: ReactNode } = (() => {
    switch (mode) {
      case 'gap':
        return {
          kicker: 'Szabad hely',
          title: 'Mi kerülhet ide?',
          meta: (
            <>
              {nf.format(gap!.start)}–{nf.format(gap!.end)} cm ({nf.format(gap!.end - gap!.start)} cm) · {formatDay(day)} napján nézve
              {neighbours.length > 0 && (
                <>
                  <br />
                  Szomszédok: {neighbours.join(', ')}
                </>
              )}
            </>
          ),
        };
      case 'new':
        return { kicker: 'Új sáv', title: 'Mi kerülhet az ágyásba?', meta: <>Bárhová, ahol {formatDay(day)} napján vagy utána hely van.</> };
      case 'insert':
        return {
          kicker: 'Új sáv',
          title: 'Mi kerülhet az ágyásba?',
          meta: target ? (
            <>
              {formatDay(day)} napján nincs szabad hely: az új sor {request.after ? `${withArticle(lower(request.after.plant_name))} után` : 'a sorok végére'} kerül, a többi
              sor arányosan keskenyedik.
            </>
          ) : (
            <>{formatDay(day)} napján nincs hely új sávnak: a sávok rögzítettek, vagy már a legkeskenyebbek.</>
          ),
        };
      case 'before':
        return {
          kicker: `Elővetemény · ${range}`,
          title: 'Mi kerülhet ide előtte?',
          meta: <>Ami {period ? untilDay(period.start) : 'a kezdetéig'} lekerül a helyről, {name} előtt.</>,
        };
      case 'after':
        return {
          kicker: `Utána · ${range}`,
          title: 'Mi kerülhet ide utána?',
          meta: (
            <>
              {capitalize(name)} után, {period ? fromDay(period.end) : 'a végétől'}.
            </>
          ),
        };
      case 'replace':
        return {
          kicker: `Csere · ${range}`,
          title: 'Mi kerülhetne ide helyette?',
          meta: <>{capitalize(name)} helyére: a hely és a szélesség marad, a dátumok és a sorszám az új növényé.</>,
        };
    }
  })();

  const q = fold(query.trim());
  const matches = (n: string) => !q || fold(n).includes(q);
  const shown = (suggestions ?? []).filter((sg) => matches(sg.plant.name_hu));
  const byRank = Map.groupBy(shown, (x) => x.rank);
  const suggested = new Set((suggestions ?? []).map((sg) => sg.plant.id));
  const offerOthers = mode !== 'before' && mode !== 'after' && !!target;
  const others =
    q && offerOthers ? plants.filter((p) => !suggested.has(p.id) && p.id !== (mode === 'replace' ? strip?.plant_id : -1) && matches(p.name_hu)) : [];
  const codeColor = (groupId: number | null) => cropColor(ws.groupCode(groupId));
  const toggle = (rank: SuggestionRank) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  const empty =
    mode === 'before'
      ? 'Ilyen rövid idő alatt egyik növény sem terem meg ezen a helyen.'
      : mode === 'after'
        ? 'Ebben az időszakban egyik növény sem fér el ezen a helyen.'
        : 'Ide ezen a napon egyik növény sem fér el. Próbálj másik napot, vagy keskeníts egy szomszédos sávot.';

  return (
    <>
      <PanelHead
        kicker={head.kicker}
        title={head.title}
        meta={head.meta}
        back={back}
        onClose={() => ws.setSelection(back && strip ? { kind: 'strip', id: strip.id } : { kind: 'none' })}
      />
      {target && (
        <label className={s.search}>
          <Search size={15} />
          <input
            type="search"
            value={query}
            placeholder="Keress bármilyen növényt…"
            aria-label="Növény keresése"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}

      {!suggestions && <p className={s.muted}>Számolás…</p>}
      {target && suggestions && shown.length === 0 && !others.length && <p className={s.muted}>{q ? 'Nincs ilyen nevű növény.' : empty}</p>}

      {SUGGESTION_RANKS.map((rank) => {
        const list = byRank.get(rank) ?? [];
        if (!list.length) return null;
        const open = !!q || expanded.has(rank);
        const visible = open ? list : list.slice(0, SHOWN[rank]);
        const hidden = list.length - visible.length;
        return (
          <PanelGroup key={rank} title={`${SUGGESTION_RANK_LABEL[rank]} (${list.length})`}>
            {visible.map((sg) => (
              <SuggestionRow
                key={sg.plant.id}
                suggestion={sg}
                year={year}
                color={codeColor(sg.plant.crop_group_id)}
                action="add"
                place={mode === 'insert' ? 'a többi sor enged neki' : undefined}
                onPick={() => {
                  onPreview(null);
                  ws.pickSuggestion(sg);
                }}
                onPreview={(on) => onPreview(on ? sg : null)}
              />
            ))}
            {hidden > 0 && (
              <button type="button" className={s.more} onClick={() => toggle(rank)}>
                {rank === 'kerulendo' ? `Kerülendők megjelenítése (${hidden})` : `Továbbiak (${hidden})`}
              </button>
            )}
          </PanelGroup>
        );
      })}

      {others.length > 0 && (
        <PanelGroup title="Nem fér el ide ezen a napon">
          {others.map((p) => (
            <button key={p.id} type="button" className={s.row} onClick={() => ws.pickPlant(p.id)}>
              <span className={s.rowText}>
                {p.name_hu}
                <span className={s.sub}>
                  {mode === 'replace'
                    ? 'a vetési naptár szerint, ugyanerre a helyre'
                    : 'a vetési naptár szerint, szabad helyre vagy a többi sáv rovására'}
                </span>
              </span>
              <span className={s.link}>
                <Plus size={14} /> {mode === 'replace' ? 'Csere' : 'Felvétel'}
              </span>
            </button>
          ))}
        </PanelGroup>
      )}

      <p className={s.foot}>
        A sorrend a vetésforgót, a mellette álló sávokat, a vetőmagkészletet és a korábbi értékeléseidet veszi figyelembe. Egy
        kattintás: {mode === 'replace' ? 'a választott növény a helyére kerül' : 'a sáv a helyére kerül'} a vetési naptár dátumaival, és
        kijelölődik.
      </p>
    </>
  );
}
