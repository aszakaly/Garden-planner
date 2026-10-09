import { CopyPlus, Info, Minus, Plus, Scissors, Trash2 } from 'lucide-react';
import { isFullLength, LAYOUT_GRID_CM } from '@shared/domain/layout.ts';
import { placementOf } from '@shared/domain/plantings.ts';
import { Chip } from '../../../components/ui/Chip.tsx';
import { Select } from '../../../components/ui/Form.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';
import { cropColor } from '../../../lib/cropColors.ts';
import { datesSummary, plantingTitle } from '../../plan/plantingView.ts';
import { isFixed } from '../layoutDraft.ts';
import { PanelGroup, PanelHead } from './PanelParts.tsx';
import type { BedWorkspaceState } from './useBedWorkspace.ts';
import ls from '../BedLayout.module.css';
import s from './Workspace.module.css';

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });

/** Léptető; a határon a gomb letiltottnak látszik, de fókuszban marad (mint a sávlistában). */
function Stepper({
  label,
  value,
  unit = 'cm',
  canLess,
  canMore,
  onStep,
}: {
  label: string;
  value: number;
  unit?: string;
  canLess: boolean;
  canMore: boolean;
  onStep: (delta: number) => void;
}) {
  return (
    <div className={s.row}>
      <span>{label}</span>
      <span className={ls.stepper}>
        <button type="button" aria-label={`${label}: kevesebb`} aria-disabled={!canLess || undefined} onClick={() => canLess && onStep(-LAYOUT_GRID_CM)}>
          <Minus size={14} />
        </button>
        <span>
          {nf.format(value)} {unit}
        </span>
        <button type="button" aria-label={`${label}: több`} aria-disabled={!canMore || undefined} onClick={() => canMore && onStep(LAYOUT_GRID_CM)}>
          <Plus size={14} />
        </button>
      </span>
    </div>
  );
}

/** A kijelölt sáv: figyelmeztetések, hely, műveletek. */
export function StripPanel({ ws, id }: { ws: BedWorkspaceState; id: number }) {
  const p = ws.byId.get(id);
  if (!p) return null;
  const { bed, year } = ws;
  const placement = placementOf(p, bed);
  const fixed = isFixed(p, year);
  const issues = ws.issues.get(id) ?? [];
  const avoid = issues.some((i) => i.level === 'kerulendo');
  const warn = !avoid && issues.some((i) => i.level === 'figyelem');
  const visible = ws.strips.some((x) => x.key === id);
  const linked = ws.linkedIds.size;
  const place = placement
    ? `${nf.format(placement.axis_start_cm)}–${nf.format(placement.axis_start_cm + placement.axis_span_cm)} cm · ${
        isFullLength(placement, ws.size.cross)
          ? 'teljes hossz'
          : `hosszában ${nf.format(placement.cross_start_cm)}–${nf.format(placement.cross_start_cm + placement.cross_span_cm)} cm`
      }`
    : 'nincs helye';

  return (
    <>
      <PanelHead
        kicker={place}
        color={cropColor(p.crop_group_code)}
        title={
          <>
            {plantingTitle(p)}
            {avoid && <Chip tone="bad">Kerülendő</Chip>}
            {warn && <Chip tone="warn">Figyelem</Chip>}
          </>
        }
        meta={
          <>
            {datesSummary(p, year)}
            {p.rows ? ` · ${p.rows} sor` : ''}
          </>
        }
        onClose={() => ws.setSelection({ kind: 'none' })}
      />

      {(issues.length > 0 || fixed || linked > 0) && (
        <PanelGroup plain>
          {issues.map((i) => (
            <Notice key={i.key} level={i.level}>
              {i.message}
            </Notice>
          ))}
          {fixed && (
            <Notice level="info">
              {p.year !== year ? 'Másik évben ültették:' : 'Már megkezdett vagy rögzített ültetés:'} a helye és a törlése a Részletek lapon
              módosítható.
            </Notice>
          )}
          {linked > 0 && (
            <Notice level="info">
              Kapcsolt sávok: további {linked} ugyanilyen ültetés áll az ágyásban (szaggatott keret). A Részletek lapon a változás rájuk is
              átkerül.
            </Notice>
          )}
        </PanelGroup>
      )}

      {id < 0 && (
        <PanelGroup title="Növény">
          <label className={s.row}>
            <span>Növény cseréje</span>
            <Select value={p.plant_id} onChange={(e) => ws.changePlant(id, Number(e.target.value))}>
              {ws.plants.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name_hu}
                </option>
              ))}
            </Select>
          </label>
        </PanelGroup>
      )}

      {!fixed && placement && visible && (
        <PanelGroup title="Hely">
          <Stepper
            label="Szélesség"
            value={placement.axis_span_cm}
            canLess={ws.canResizeStripRow(id, -LAYOUT_GRID_CM)}
            canMore={ws.canResizeStripRow(id, LAYOUT_GRID_CM)}
            onStep={(d) => ws.resizeStripRow(id, d)}
          />
          <Stepper
            label="Hossz kezdete"
            value={placement.cross_start_cm}
            canLess={ws.canStepCross(id, 'start', -LAYOUT_GRID_CM)}
            canMore={ws.canStepCross(id, 'start', LAYOUT_GRID_CM)}
            onStep={(d) => ws.stepCross(id, 'start', d)}
          />
          <Stepper
            label="Hossza"
            value={placement.cross_span_cm}
            canLess={ws.canStepCross(id, 'span', -LAYOUT_GRID_CM)}
            canMore={ws.canStepCross(id, 'span', LAYOUT_GRID_CM)}
            onStep={(d) => ws.stepCross(id, 'span', d)}
          />
        </PanelGroup>
      )}

      <div className={s.buttons}>
        {!fixed && (
          <button type="button" onClick={() => ws.duplicate(id)}>
            <CopyPlus size={15} /> Még egy sáv ebből
          </button>
        )}
        {!fixed && (
          <button type="button" onClick={() => ws.split(id)}>
            <Scissors size={15} /> Szétvágás hosszában
          </button>
        )}
        {/* mentetlen módosításnál a részletes lap előtt a teljes piszkozat mentődik */}
        <button type="button" disabled={ws.saving} onClick={() => ws.openDetails(id)}>
          <Info size={15} /> {ws.dirty ? 'Mentés és részletek' : 'Részletek'}
        </button>
        {!fixed && (
          <button type="button" className={s.danger} onClick={() => ws.remove(id)}>
            <Trash2 size={15} /> Törlés
          </button>
        )}
      </div>
    </>
  );
}
