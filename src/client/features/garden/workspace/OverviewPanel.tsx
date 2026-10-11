import { Lightbulb } from 'lucide-react';
import { LAYOUT_PHASES, LAYOUT_PHASE_LABEL } from '@shared/labels.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import { occupancyPeriod } from '@shared/domain/plantings.ts';
import type { ClashFix } from '@shared/domain/layout.ts';
import type { PlantingListItem } from '@shared/types.ts';
import { Notice } from '../../../components/ui/Notice.tsx';
import { plantingTitle } from '../../plan/plantingView.ts';
import { bedRotationNotices } from '../BedHistory.tsx';
import { PanelGroup, PanelHead } from './PanelParts.tsx';
import type { BedWorkspaceState } from './useBedWorkspace.ts';
import s from './Workspace.module.css';

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });

function fixLabel(f: ClashFix, byId: Map<number, PlantingListItem>): string {
  const name = byId.get(f.plantingId)?.plant_name ?? '';
  return f.kind === 'elozo_vege' ? `${name}: a hely ${shortDate(f.date)} szabadul fel` : `${name} később (${shortDate(f.date)} után)`;
}

/** Kijelölés nélkül: az ágyás egésze – vetésforgó, figyelmeztetések, szabad helyek, kihasználtság. */
export function OverviewPanel({ ws }: { ws: BedWorkspaceState }) {
  const { bed, year, ctx, warnings, clashes, byId, days } = ws;
  const rotation = ctx ? bedRotationNotices(bed, year, ctx) : [];
  const free = LAYOUT_PHASES.flatMap((phase) => ws.gapsAt(days[phase]).map((g) => ({ phase, ...g })));
  const count = warnings.length + clashes.length;

  return (
    <>
      <PanelHead
        kicker={`Nincs kijelölés · ${year}`}
        title="Az ágyás áttekintése"
        meta="Kattints egy sávra vagy egy szabad helyre a részletekért."
      />

      <PanelGroup title="Vetésforgó" plain>
        {rotation.length ? (
          rotation.map((n, i) => (
            <Notice key={i} level={n.level}>
              {n.message}
            </Notice>
          ))
        ) : (
          <p className={s.muted}>Az előzmények töltődnek…</p>
        )}
      </PanelGroup>

      <PanelGroup title={`Figyelmeztetések (${count})`} plain>
        {count === 0 && <p className={s.muted}>Nincs figyelmeztetés.</p>}
        {warnings.map((i) => {
          const p = byId.get(i.plantingId);
          return (
            <Notice key={i.key} level={i.level === 'kerulendo' ? 'kerulendo' : 'figyelem'}>
              {p && <b>{plantingTitle(p)}: </b>}
              {i.message}
              <span className={s.actions}>
                <button type="button" onClick={() => ws.showPlanting(i.plantingId)}>
                  Megmutatás
                </button>
              </span>
            </Notice>
          );
        })}
        {clashes.map((c) => (
          <Notice key={c.key} level="figyelem">
            <b>Helyütközés {shortDate(c.start)} – {shortDate(c.end)}:</b> {plantingTitle(c.a)} és {plantingTitle(c.b)} ugyanazt a helyet foglalná.
            <span className={s.actions}>
              {c.fixes.map((f) => (
                <button key={f.kind} type="button" onClick={() => ws.fix(f)}>
                  {fixLabel(f, byId)}
                </button>
              ))}
              <button type="button" onClick={() => ws.showPlanting(c.b.id)}>
                Megmutatás
              </button>
            </span>
          </Notice>
        ))}
      </PanelGroup>

      {ws.unplaced.length > 0 && (
        <PanelGroup title={`Elhelyezésre vár (${ws.unplaced.length})`}>
          {ws.unplaced.map((p) => {
            // dátum nélkül a hely sem jelölhető ki: előbb a panelen kell megadni, mikor kerül az ágyásba
            const dated = occupancyPeriod(p) != null;
            return (
              <div key={p.id} className={s.row}>
                <span className={s.rowText}>
                  {plantingTitle(p)}
                  <span className={s.sub}>{dated ? 'nincs helye az ágyásban' : 'nincs dátuma, ezért nem tudni, mikor áll itt'}</span>
                </span>
                <button type="button" className={s.link} onClick={() => (dated ? ws.placeUnplaced(p.id) : ws.selectStrip(p.id))}>
                  {dated ? 'Hely kijelölése' : 'Dátum megadása'}
                </button>
              </div>
            );
          })}
        </PanelGroup>
      )}

      <PanelGroup title="Szabad helyek">
        {free.length === 0 && <p className={s.muted}>A három időpontban nincs teljes hosszú szabad hely.</p>}
        {free.map((g) => (
          <button
            key={`${g.phase}-${g.start}`}
            type="button"
            className={s.row}
            onClick={() => {
              ws.setDay(days[g.phase]);
              ws.setSelection({ kind: 'gap', start: g.start, end: g.end });
            }}
          >
            <span className={s.rowText}>
              {LAYOUT_PHASE_LABEL[g.phase]} · {nf.format(g.start)}–{nf.format(g.end)} cm
              <span className={s.sub}>
                {shortDate(days[g.phase])} · {nf.format(g.end - g.start)} cm széles
              </span>
            </span>
            <span className={s.link}>
              <Lightbulb size={13} /> Javaslatok
            </span>
          </button>
        ))}
      </PanelGroup>

      <PanelGroup title="Kihasználtság">
        {LAYOUT_PHASES.map((phase) => {
          const pct = Math.round(ws.usage(days[phase]) * 100);
          return (
            <div key={phase} className={s.bar}>
              <span>{LAYOUT_PHASE_LABEL[phase]}</span>
              <span className={s.barTrack}>
                <span className={s.barFill} style={{ width: `${pct}%` }} />
              </span>
              <span className={s.barValue}>{pct}%</span>
            </div>
          );
        })}
      </PanelGroup>
    </>
  );
}
