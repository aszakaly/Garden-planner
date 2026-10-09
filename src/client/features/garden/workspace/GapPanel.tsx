import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { endOf } from '@shared/domain/layout.ts';
import { suggestPlantings, SUGGESTION_RANK_LABEL, SUGGESTION_RANKS, type Suggestion, type SuggestionRank } from '@shared/domain/suggestions.ts';
import { cropColor } from '../../../lib/cropColors.ts';
import { formatDay, todayISO } from '../../../lib/format.ts';
import { SuggestionRow } from '../../plan/SuggestionRow.tsx';
import { PanelGroup, PanelHead } from './PanelParts.tsx';
import type { BedWorkspaceState } from './useBedWorkspace.ts';
import s from './Workspace.module.css';

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });
/** Ennyi javaslat látszik csoportonként, amíg nincs keresés */
const SHOWN: Record<SuggestionRank, number> = { ajanlott: 6, lehetseges: 4, kerulendo: 0 };
/** Kis- és nagybetű, valamint ékezet nélküli összevetés a kereséshez */
const fold = (t: string) => t.toLocaleLowerCase('hu').normalize('NFD').replace(/\p{Diacritic}/gu, '');

interface Props {
  ws: BedWorkspaceState;
  /** Előnézet az ágyásképen: a fölé vitt vagy fókuszban lévő javaslat */
  onPreview: (sg: Suggestion | null) => void;
}

/**
 * Szabad hely vagy új sáv: rangsorolt javaslatok a kijelölt helyre és napra, kereséssel. A javaslat
 * egy kattintással a helyére kerül; a keresőben a javaslatok közé nem férő növény is felvehető.
 */
export function GapPanel({ ws, onPreview }: Props) {
  const { bed, year, day, selection, ctx, plants, seeds } = ws;
  const gap = selection.kind === 'gap' ? selection : null;
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<SuggestionRank>>(new Set());

  const start = gap?.start;
  const end = gap?.end;
  const suggestions = useMemo(() => {
    if (!ctx || !plants.length) return null;
    return suggestPlantings({
      target: {
        bed,
        year,
        strip: start != null && end != null ? { start, span: end - start } : null,
        cross: null,
        from: `${year}-01-01`,
        today: todayISO(),
        day,
        fill: false,
      },
      plants,
      seeds,
      ctx,
    });
  }, [ctx, plants, seeds, bed, year, day, start, end]);

  // A szabad hely két szomszédja a napon
  const neighbours = gap
    ? ws.strips
        .filter((x) => Math.abs(endOf(x.placement, 'axis') - gap.start) < 0.5 || Math.abs(x.placement.axis_start_cm - gap.end) < 0.5)
        .map((x) => ws.byId.get(x.key)?.plant_name.toLocaleLowerCase('hu'))
        .filter(Boolean)
    : [];
  const q = fold(query.trim());
  const matches = (name: string) => !q || fold(name).includes(q);
  const shown = (suggestions ?? []).filter((sg) => matches(sg.plant.name_hu));
  const byRank = Map.groupBy(shown, (x) => x.rank);
  const suggested = new Set((suggestions ?? []).map((sg) => sg.plant.id));
  const others = q ? plants.filter((p) => !suggested.has(p.id) && matches(p.name_hu)) : [];
  const codeColor = (groupId: number | null) => cropColor(ws.groupCode(groupId));
  const toggle = (rank: SuggestionRank) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });

  return (
    <>
      <PanelHead
        kicker={gap ? 'Szabad hely' : 'Új sáv'}
        title={gap ? 'Mi kerülhet ide?' : 'Mi kerülhet az ágyásba?'}
        meta={
          gap ? (
            <>
              {nf.format(gap.start)}–{nf.format(gap.end)} cm ({nf.format(gap.end - gap.start)} cm) · {formatDay(day)} napján nézve
              {neighbours.length > 0 && (
                <>
                  <br />
                  Szomszédok: {neighbours.join(', ')}
                </>
              )}
            </>
          ) : (
            <>Bárhová, ahol {formatDay(day)} napján vagy utána hely van.</>
          )
        }
        onClose={() => ws.setSelection({ kind: 'none' })}
      />
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

      {!suggestions && <p className={s.muted}>Számolás…</p>}
      {suggestions && shown.length === 0 && !others.length && (
        <p className={s.muted}>
          {q
            ? 'Nincs ilyen nevű növény.'
            : 'Ide ezen a napon egyik növény sem fér el. Próbálj másik napot, vagy keskeníts egy szomszédos sávot.'}
        </p>
      )}

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
                onPick={() => {
                  onPreview(null);
                  ws.addSuggestion(sg);
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
            <button key={p.id} type="button" className={s.row} onClick={() => ws.addPlant(p.id)}>
              <span className={s.rowText}>
                {p.name_hu}
                <span className={s.sub}>a vetési naptár szerint, szabad helyre vagy a többi sáv rovására</span>
              </span>
              <span className={s.link}>
                <Plus size={14} /> Felvétel
              </span>
            </button>
          ))}
        </PanelGroup>
      )}

      <p className={s.foot}>
        A sorrend a vetésforgót, a mellette álló sávokat, a vetőmagkészletet és a korábbi értékeléseidet veszi figyelembe. Egy
        kattintás: a sáv a helyére kerül a vetési naptár dátumaival, és kijelölődik.
      </p>
    </>
  );
}
