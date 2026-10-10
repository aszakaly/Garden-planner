import { ChevronDown, ChevronUp, CircleAlert, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker, useSearchParams } from 'react-router';
import type { Suggestion } from '@shared/domain/suggestions.ts';
import type { Bed } from '@shared/types.ts';
import { Block, Muted } from '../../../components/ui/Detail.tsx';
import { anySheetOpen } from '../../../components/ui/Sheet.tsx';
import { cropColor } from '../../../lib/cropColors.ts';
import { formatDay } from '../../../lib/format.ts';
import { useStoredState } from '../../../lib/useStoredState.ts';
import { useYearGuard } from '../../../lib/year.tsx';
import { BedTimeline } from '../../plan/BedTimeline.tsx';
import { PlantingEditSheet } from '../../plan/PlantingEditSheet.tsx';
import { PlantingRow } from '../../plan/PlantingRow.tsx';
import { TimelineLegend } from '../../plan/TimelineLegend.tsx';
import { byStart } from '../../plan/plantingView.ts';
import { LayoutCanvas } from '../LayoutCanvas.tsx';
import { LayoutPhasePicker } from '../LayoutPhasePicker.tsx';
import { LayoutRowList } from '../LayoutRowList.tsx';
import { SuggestPanel } from './SuggestPanel.tsx';
import { OverviewPanel } from './OverviewPanel.tsx';
import { StripPanel } from './StripPanel.tsx';
import { useBedWorkspace } from './useBedWorkspace.ts';
import ls from '../BedLayout.module.css';
import s from './Workspace.module.css';

const LEAVE = 'Mentetlen módosítások vannak az ágyás tervében. Elveted őket?';
const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });

/** Szövegmezőben az Esc a mezőé (pl. a kereső törlése), nem a kijelölésé. */
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

interface Props {
  bed: Bed;
  year: number;
  /** Az oldal további blokkjai (napló, előzmények…): a munkalap blokkjai és a mentés-sáv közé */
  children?: ReactNode;
}

/**
 * Az ágyás-munkalap: időválasztó, ágyáskép és sávlista, mellette a kijelöléshez igazodó panel;
 * alatta az idővonal és az év ültetései. Minden a piszkozatban változik, a „Mentés” egyben ír.
 * Ágyásonként és évenként új példány kell (`key`).
 */
export function BedWorkspace({ bed, year, children }: Props) {
  const ws = useBedWorkspace(bed, year);
  const [preview, setPreview] = useState<Suggestion | null>(null);
  const [timelineOpen, setTimelineOpen] = useStoredState('kerttervezo.munkalap.idovonal', true);
  const [listOpen, setListOpen] = useStoredState('kerttervezo.munkalap.ultetesek', false);
  const [params, setParams] = useSearchParams();
  const { selection } = ws;

  // Belépési hivatkozás (`?ultetes=…`): kijelöli az ültetést, és a napját odaállítja
  const linked = Number(params.get('ultetes'));
  useEffect(() => {
    if (!ws.loaded || !linked) return;
    ws.showPlanting(linked);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('ultetes');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.loaded, linked]);

  // Mentetlen módosítással az oldal elhagyása, az évváltás és a böngészőlap bezárása előtt kérdez
  const blocker = useBlocker(({ currentLocation, nextLocation }) => ws.dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(LEAVE)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useYearGuard(ws.dirty, () => window.confirm(LEAVE));
  useEffect(() => {
    if (!ws.dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [ws.dirty]);

  // Billentyűk: Esc a kijelölést szünteti meg, a Cmd/Ctrl+Enter ment (ha nincs nyitva lap)
  const latest = useRef(ws);
  latest.current = ws;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anySheetOpen()) return;
      const w = latest.current;
      if (e.key === 'Escape' && !isTyping(e.target) && w.selection.kind !== 'none') {
        // a sáv helyére kért javaslatból vissza a sávhoz
        const sel = w.selection;
        w.setSelection(sel.kind === 'before' || sel.kind === 'after' || sel.kind === 'replace' ? { kind: 'strip', id: sel.id } : { kind: 'none' });
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && w.dirty && !w.saving) {
        e.preventDefault();
        w.commit();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Az előnézet csak a javaslatlista mellett él, és ott, ahol a javaslat a napon látszana
  const showPreview = preview && (selection.kind === 'gap' || selection.kind === 'replace' || (selection.kind === 'new' && ws.request?.mode === 'new'));
  const selectedStrip = 'id' in selection ? selection.id : null;
  const ghost = showPreview
    ? {
        placement: preview.placement,
        color: cropColor(ws.groupCode(preview.plant.crop_group_id)),
        label: `${preview.plant.name_hu} · előnézet`,
      }
    : null;
  const freeM2 = (ws.size.axis * ws.size.cross * (1 - ws.usage(ws.day))) / 10000;
  const mine = ws.items.filter((p) => p.year === year).sort(byStart);
  const detailsPlanting = ws.detailsId != null ? ws.plantings?.find((p) => p.id === ws.detailsId) : undefined;

  return (
    <div className={s.workspace}>
      <div className={s.grid}>
        <section className={s.stage} aria-busy={ws.saving || undefined} aria-label="Ágyás kiosztása">
          {!ws.loaded ? (
            <p className={s.loading}>Betöltés…</p>
          ) : (
            <>
              <LayoutPhasePicker bed={bed} year={year} days={ws.days} day={ws.day} previews={ws.previews} onChange={ws.setDay} />
              <div className={ls.canvasWrap}>
                <LayoutCanvas
                  bed={bed}
                  strips={ws.canvasStrips}
                  boundaries={ws.canvasBoundaries}
                  selected={selectedStrip}
                  linked={ws.linkedIds}
                  onSelect={ws.selectStrip}
                  onChange={ws.drag}
                  gaps={ws.canvasGaps}
                  ghost={ghost}
                  onSelectGap={ws.selectGap}
                  locked={ws.saving}
                />
                <p className={ls.hint}>
                  {ws.strips.length
                    ? 'Kattints egy sávra (méretezés a szélénél, mozgatás a közepénél) vagy egy szabad helyre (javaslatok). A határon zöld vonal: jó szomszédok, piros: kerülendők.'
                    : `${formatDay(ws.day)}: az ágyás üres. Kattints rá, és a panel megmutatja, mi kerülhet ide.`}
                </p>
              </div>
              <LayoutRowList
                rows={ws.rows}
                strips={ws.rowStrips}
                reorderable={ws.reorderable}
                selected={selectedStrip}
                onSelect={ws.selectStrip}
                onMoveRow={ws.moveRowAt}
                onResizeRow={ws.resizeRowAt}
                gaps={ws.canvasGaps}
                onSelectGap={ws.selectGap}
              />
              <div className={ls.addBar}>
                <button type="button" className={ls.addButton} disabled={!ws.plants.length} onClick={() => ws.setSelection({ kind: 'new', after: selectedStrip })}>
                  <Plus size={15} /> Új sáv
                </button>
                <span className={ls.free}>
                  szabad {formatDay(ws.day)}: {nf.format(Math.max(0, freeM2))} m²
                </span>
              </div>
            </>
          )}
        </section>

        <aside className={s.panel} aria-label="Részletek">
          {selection.kind === 'strip' ? (
            <StripPanel key={selection.id} ws={ws} id={selection.id} />
          ) : selection.kind === 'none' ? (
            <OverviewPanel ws={ws} />
          ) : (
            <SuggestPanel
              key={selection.kind === 'gap' ? `gap-${selection.start}-${selection.end}-${ws.day}` : `${selection.kind}-${'id' in selection ? selection.id : ''}-${ws.day}`}
              ws={ws}
              onPreview={setPreview}
            />
          )}
        </aside>
      </div>

      <Block
        title={`Idővonal ${year}`}
        action={
          <button type="button" className={s.blockToggle} aria-expanded={timelineOpen} onClick={() => setTimelineOpen(!timelineOpen)}>
            {timelineOpen ? 'Bezárás' : 'Megnyitás'} {timelineOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        }
      >
        {timelineOpen &&
          (ws.placed.length ? (
            <>
              <BedTimeline
                year={year}
                bed={bed}
                items={ws.placed}
                clashes={ws.rawClashes}
                frost={ws.frost}
                cursor={ws.day}
                onPickDate={ws.setDay}
                onSelect={(p) => ws.showPlanting(p.id)}
              />
              <TimelineLegend plantings={ws.placed.map((o) => o.planting)} tray />
            </>
          ) : (
            <Muted>Itt látszik majd, mikor melyik rész foglalt: vízszintesen az év hónapjai, függőlegesen az ágyás sávjai.</Muted>
          ))}
      </Block>

      <Block
        title={`Ültetések ${year} (${mine.length})`}
        action={
          <button type="button" className={s.blockToggle} aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>
            {listOpen ? 'Bezárás' : 'Megnyitás'} {listOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        }
      >
        {listOpen &&
          (mine.length ? (
            mine.map((p) => (
              <PlantingRow key={p.id} planting={p} year={year} bed={bed} issues={ws.issues.get(p.id)} onOpen={() => ws.showPlanting(p.id)} />
            ))
          ) : (
            <Muted>Ebben az évben még nincs ültetés ebben az ágyásban.</Muted>
          ))}
      </Block>

      {children}

      <div className={s.bottom}>
        {ws.notice && (
          <div className={s.notice} role="alert">
            <span>{ws.notice}</span>
            <button type="button" aria-label="Üzenet bezárása" onClick={() => ws.setNotice(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        {ws.dirty && (
          <div className={s.saveBar} role="region" aria-label="Mentetlen módosítások">
            <span className={s.saveCount}>{ws.changes} nem mentett módosítás</span>
            {ws.avoidCount > 0 && (
              <span className={s.saveAvoid}>
                <CircleAlert size={14} /> {ws.avoidCount} kerülendő
              </span>
            )}
            <button
              type="button"
              className={s.discard}
              disabled={ws.saving}
              onClick={() => window.confirm('Elveted a módosításokat? A mentett állapot áll vissza.') && ws.discard()}
            >
              Elvetés
            </button>
            <button type="button" className={s.save} disabled={ws.saving} onClick={() => ws.commit()} title="Mentés (Cmd+Enter)">
              {ws.saving ? 'Mentés…' : 'Mentés'}
            </button>
          </div>
        )}
      </div>

      {detailsPlanting && (
        <PlantingEditSheet open onClose={ws.closeDetails} planting={detailsPlanting} year={detailsPlanting.year} actualOnly />
      )}
    </div>
  );
}
