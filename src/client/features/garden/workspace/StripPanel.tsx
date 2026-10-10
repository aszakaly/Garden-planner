import { ChevronRight, CopyPlus, Minus, Plus, Replace, Scissors, Trash2 } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { PLANTING_METHODS, PLANTING_METHOD_LABEL, SEED_ORIGIN_LABEL, type PlantingMethod } from '@shared/labels.ts';
import { usesSow, usesTransplant } from '@shared/domain/dates.ts';
import { estimatePlantCount } from '@shared/domain/geometry.ts';
import { isFullLength, LAYOUT_GRID_CM } from '@shared/domain/layout.ts';
import { occupancyPeriod, placementOf } from '@shared/domain/plantings.ts';
import type { PlantingListItem, Variety } from '@shared/types.ts';
import { Chip } from '../../../components/ui/Chip.tsx';
import { DateInput, FormRow, NumberInput, Select, TextArea, TextInput, Toggle } from '../../../components/ui/Form.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';
import { SegmentedControl } from '../../../components/ui/SegmentedControl.tsx';
import { api } from '../../../lib/api.ts';
import { cropColor } from '../../../lib/cropColors.ts';
import { errorMessage } from '../../../lib/errors.ts';
import { qk, useApiMutation, usePlantDetail } from '../../../lib/queries.ts';
import {
  cropOf,
  defaultWindow,
  NEW_VARIETY,
  newestStock,
  planOf,
  seriesDefaults,
  sowLabel,
  windowOptions,
  withDate,
  withMethod,
  withPlan,
  withSuggestedDates,
  withWindow,
  type PlanFields,
} from '../../plan/plantingForm.ts';
import { datesSummary, dateInYear, plantingTitle, type PlacedPlanting } from '../../plan/plantingView.ts';
import { isDraftSeries, isFixed } from '../layoutDraft.ts';
import { PanelGroup, PanelHead } from './PanelParts.tsx';
import { fromDay, untilDay } from './panelText.ts';
import type { BedWorkspaceState } from './useBedWorkspace.ts';
import ls from '../BedLayout.module.css';
import s from './Workspace.module.css';

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });

/** Léptető; a határon a gomb letiltottnak látszik, de fókuszban marad (mint a sávlistában). */
function Stepper({
  label,
  value,
  unit = 'cm',
  step = LAYOUT_GRID_CM,
  canLess,
  canMore,
  onStep,
}: {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  canLess: boolean;
  canMore: boolean;
  onStep: (delta: number) => void;
}) {
  return (
    <div className={s.row}>
      <span>{label}</span>
      <span className={ls.stepper}>
        <button type="button" aria-label={`${label}: kevesebb`} aria-disabled={!canLess || undefined} onClick={() => canLess && onStep(-step)}>
          <Minus size={14} />
        </button>
        <span>
          {nf.format(value)} {unit}
        </span>
        <button type="button" aria-label={`${label}: több`} aria-disabled={!canMore || undefined} onClick={() => canMore && onStep(step)}>
          <Plus size={14} />
        </button>
      </span>
    </div>
  );
}

/** Egy sor az „Ezen a helyen” láncban: a sáv előtt vagy után álló ültetés. */
function ChainItem({ o, year, onOpen }: { o: PlacedPlanting; year: number; onOpen: () => void }) {
  return (
    <button type="button" className={s.row} onClick={onOpen} style={{ '--sc': cropColor(o.planting.crop_group_code) } as CSSProperties}>
      <span className={s.rowText}>
        <span className={s.chainDot} />
        {plantingTitle(o.planting)}
        <span className={s.sub}>
          {dateInYear(o.period.start, year)} – {dateInYear(o.period.end, year)}
        </span>
      </span>
      <ChevronRight size={15} className={s.chevron} />
    </button>
  );
}

/**
 * A kijelölt sáv: figyelmeztetések, „Ezen a helyen [év]” (elő- és utóvetemény), a tervezési adatok
 * (növény, fajta, vetőmag, időszak és módszer, dátumok, hely, sorok, tőszám, újravetés, megjegyzés),
 * műveletek és a „Tény és napló” lap. Minden a piszkozatban változik.
 */
export function StripPanel({ ws, id }: { ws: BedWorkspaceState; id: number }) {
  const p = ws.byId.get(id);
  const { data: detail } = usePlantDetail(p?.plant_id ?? 0);
  const [newVariety, setNewVariety] = useState<string | null>(null);
  const addVariety = useApiMutation(
    (name: string) => api.post<Variety>(`/plants/${p!.plant_id}/varieties`, { name }),
    [qk.varieties, qk.plants],
  );
  if (!p) return null;

  const { bed, year, frost, seeds } = ws;
  const placement = placementOf(p, bed);
  const period = occupancyPeriod(p);
  const fixed = isFixed(p, year);
  const otherYear = p.year !== year;
  // a terv a saját évének munkalapján szerkeszthető; a gyors előzménynek nincs terve
  const editable = !otherYear && !p.is_history;
  const issues = ws.issues.get(id) ?? [];
  const avoid = issues.some((i) => i.level === 'kerulendo');
  const warn = !avoid && issues.some((i) => i.level === 'figyelem');
  const visible = ws.strips.some((x) => x.key === id);
  const linked = ws.linkedIds.size;
  const chain = ws.placeChain(id);
  const place = placement
    ? `${nf.format(placement.axis_start_cm)}–${nf.format(placement.axis_start_cm + placement.axis_span_cm)} cm · ${
        isFullLength(placement, ws.size.cross)
          ? 'teljes hossz'
          : `hosszában ${nf.format(placement.cross_start_cm)}–${nf.format(placement.cross_start_cm + placement.cross_span_cm)} cm`
      }`
    : 'nincs helye';

  // Tervezési adatok: a közös űrlaplogikával (mint az ültetési lapon)
  const plant = ws.plants.find((x) => x.id === p.plant_id);
  const varieties = detail?.plant.id === p.plant_id ? detail.varieties : [];
  const variety = varieties.find((v) => v.id === p.variety_id) ?? null;
  const windows = windowOptions(plant, variety);
  const window = windows.find((x) => x.w.id === p.window_id)?.w ?? null;
  const crop = plant ? cropOf(plant, variety) : null;
  const form = planOf(p);
  const stocks = seeds.filter((x) => x.variety_id === p.variety_id);
  const save = (f: PlanFields, v: Variety | null = variety) => ws.editPlanting(withPlan(p, f, { plant, variety: v, seeds }));
  const edit = (patch: Partial<PlantingListItem>) => ws.editPlanting({ ...p, ...patch });

  const chooseVariety = (vid: number | null, created?: Variety) => {
    if (vid === NEW_VARIETY) {
      setNewVariety('');
      return;
    }
    setNewVariety(null);
    const v = created ?? varieties.find((x) => x.id === vid) ?? null;
    let f: PlanFields = { ...form, variety_id: vid, seed_stock_id: newestStock(seeds, vid)?.id ?? null };
    const own = varieties.find((x) => x.id === vid)?.windows ?? [];
    if (own.length && plant) f = withWindow(f, defaultWindow(own, year), cropOf(plant, v), frost);
    save(f, v);
  };
  const chooseWindow = (wid: number | null) => {
    const w = windows.find((x) => x.w.id === wid)?.w ?? null;
    save(w && crop ? withWindow(form, w, crop, frost) : { ...form, window_id: null });
  };
  const chooseMethod = (m: PlantingMethod) => save(withMethod(form, m, window, crop, frost));

  // Újravetés: a piszkozatban indított sorozat feje állítja
  const succession = ws.succession(id);
  const members = p.series_id ? ws.seriesOf(p) : [];
  const head = members[0];
  const canSeries = editable && !fixed && (!p.series_id || (isDraftSeries(p) && p.series_index === 1));
  const estimate = placement ? estimatePlantCount(p.rows, placement.cross_span_cm, p.in_row_spacing_cm) : null;

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

      {(issues.length > 0 || fixed) && (
        <PanelGroup plain>
          {issues.map((i) => (
            <Notice key={i.key} level={i.level}>
              {i.message}
            </Notice>
          ))}
          {fixed && (
            <Notice level="info">
              {otherYear
                ? `${p.year}. évi ültetés: a terve a ${p.year}. évi munkalapon, a helye és a törlése a Tény és napló lapon módosítható.`
                : 'Már megkezdett vagy rögzített ültetés: a helye és a törlése a Tény és napló lapon módosítható.'}
            </Notice>
          )}
        </PanelGroup>
      )}
      {!fixed && (
        <div className={s.buttons}>
          <button type="button" onClick={() => ws.setSelection({ kind: 'replace', id })}>
            <Replace size={15} /> Mi kerülhetne ide helyette?
          </button>
        </div>
      )}

      {chain && (chain.before.length > 0 || chain.after.length > 0 || chain.freeBefore || chain.freeAfter) && (
        <PanelGroup title={`Ezen a helyen ${year}`}>
          {chain.before.map((o) => (
            <ChainItem key={o.id} o={o} year={year} onOpen={() => ws.showPlanting(o.id)} />
          ))}
          {chain.freeBefore && (
            <button type="button" className={s.row} onClick={() => ws.setSelection({ kind: 'before', id })}>
              <span className={s.rowText}>
                <span className={s.link}>
                  <Plus size={14} /> Elővetemény
                </span>
                <span className={s.sub}>{untilDay(chain.freeBefore.end)} szabad</span>
              </span>
              <ChevronRight size={15} className={s.chevron} />
            </button>
          )}
          <div className={`${s.row} ${s.chainSelf}`} style={{ '--sc': cropColor(p.crop_group_code) } as CSSProperties}>
            <span className={s.rowText}>
              <span className={s.chainDot} />
              {plantingTitle(p)}
              {chain.own && (
                <span className={s.sub}>
                  {dateInYear(chain.own.period.start, year)} – {dateInYear(chain.own.period.end, year)}
                </span>
              )}
            </span>
          </div>
          {chain.freeAfter && (
            <button type="button" className={s.row} onClick={() => ws.setSelection({ kind: 'after', id })}>
              <span className={s.rowText}>
                <span className={s.link}>
                  <Plus size={14} /> Utána
                </span>
                <span className={s.sub}>{fromDay(chain.freeAfter.start)} szabad</span>
              </span>
              <ChevronRight size={15} className={s.chevron} />
            </button>
          )}
          {chain.after.map((o) => (
            <ChainItem key={o.id} o={o} year={year} onOpen={() => ws.showPlanting(o.id)} />
          ))}
        </PanelGroup>
      )}

      {editable && (
        <>
          <PanelGroup title="Növény">
            <FormRow label="Növény">
              {fixed ? (
                <span className={s.value}>{p.plant_name}</span>
              ) : (
                <Select value={p.plant_id} onChange={(e) => ws.changePlant(id, Number(e.target.value))}>
                  {ws.plants.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name_hu}
                    </option>
                  ))}
                </Select>
              )}
            </FormRow>
            <FormRow label="Fajta">
              <Select
                value={newVariety != null ? NEW_VARIETY : (p.variety_id ?? '')}
                onChange={(e) => chooseVariety(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Fajta nélkül</option>
                {varieties.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                {/* a még be nem töltött, de már beállított fajta is látsszon */}
                {p.variety_id != null && !varieties.some((v) => v.id === p.variety_id) && (
                  <option value={p.variety_id}>{p.variety_name ?? 'Fajta'}</option>
                )}
                <option value={NEW_VARIETY}>＋ Új fajta…</option>
              </Select>
            </FormRow>
            {newVariety != null && (
              <div className={`${s.row} ${s.newVariety}`}>
                <TextInput
                  value={newVariety}
                  placeholder="Az új fajta neve, pl. Ökörszív"
                  aria-label="Új fajta neve"
                  onChange={(e) => setNewVariety(e.target.value)}
                />
                <span className={s.inlineButtons}>
                  <button
                    type="button"
                    disabled={!newVariety.trim() || addVariety.isPending}
                    onClick={() => addVariety.mutate(newVariety.trim(), { onSuccess: (v) => chooseVariety(v.id, v) })}
                  >
                    Felvétel
                  </button>
                  <button type="button" onClick={() => setNewVariety(null)}>
                    Mégse
                  </button>
                </span>
              </div>
            )}
            {p.variety_id != null && usesSow(form.method) && stocks.length > 0 && (
              <FormRow label="Vetőmag">
                <Select
                  value={p.seed_stock_id ?? ''}
                  onChange={(e) => save({ ...form, seed_stock_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Nincs megadva</option>
                  {stocks.map((x) => (
                    <option key={x.id} value={x.id}>
                      {[x.vintage_year ?? 'évjárat nélkül', x.supplier ?? SEED_ORIGIN_LABEL[x.origin_type]].join(' · ')}
                      {x.in_stock ? '' : ' (elfogyott)'}
                    </option>
                  ))}
                </Select>
              </FormRow>
            )}
          </PanelGroup>
          {addVariety.error && <p className={s.error}>{errorMessage(addVariety.error)}</p>}

          <PanelGroup title="Időszak és módszer">
            <FormRow label="Időszak">
              <Select value={p.window_id ?? ''} onChange={(e) => chooseWindow(e.target.value ? Number(e.target.value) : null)}>
                {windows.map(({ w, label }) => (
                  <option key={w.id} value={w.id}>
                    {label}
                  </option>
                ))}
                <option value="">Egyéni dátumok</option>
              </Select>
            </FormRow>
            {!window && (
              <FormRow label="Módszer">
                <Select value={form.method} onChange={(e) => chooseMethod(e.target.value as PlantingMethod)}>
                  {PLANTING_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PLANTING_METHOD_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </FormRow>
            )}
            {window?.method === 'palanta' && (
              <div className={s.row}>
                <SegmentedControl<PlantingMethod>
                  label="Palánta"
                  size="small"
                  value={form.method}
                  options={[
                    { value: 'palanta', label: 'Saját nevelés' },
                    { value: 'vasarolt_palanta', label: 'Vásárolt palánta' },
                  ]}
                  onChange={chooseMethod}
                />
              </div>
            )}
          </PanelGroup>

          <PanelGroup title="Dátumok">
            {usesSow(form.method) && !p.carried_from_id && (
              <FormRow label={sowLabel(form.method)}>
                <DateInput value={form.dates.sow} onChange={(v) => save(withDate(form, 'sow', v, crop, frost))} />
              </FormRow>
            )}
            {usesTransplant(form.method) && (
              <FormRow label="Kiültetés">
                <DateInput value={form.dates.transplant} onChange={(v) => save(withDate(form, 'transplant', v, crop, frost))} />
              </FormRow>
            )}
            <FormRow label="Betakarítás kezdete">
              <DateInput value={form.dates.harvestStart} onChange={(v) => save(withDate(form, 'harvestStart', v, crop, frost))} />
            </FormRow>
            <FormRow label={p.perennial ? 'Terület felszabadul (évelő)' : 'Terület felszabadul'}>
              <DateInput value={form.dates.end} onChange={(v) => save(withDate(form, 'end', v, crop, frost))} />
            </FormRow>
            {window && (
              <button type="button" className={s.more} onClick={() => save(withSuggestedDates(form, window, crop, frost))}>
                Javasolt dátumok visszaállítása
              </button>
            )}
          </PanelGroup>
        </>
      )}

      {(editable || (!fixed && placement && visible)) && (
        <PanelGroup title="Hely és tövek">
          {!fixed && placement && visible && (
            <Stepper
              label="Szélesség"
              value={placement.axis_span_cm}
              canLess={ws.canResizeStripRow(id, -LAYOUT_GRID_CM)}
              canMore={ws.canResizeStripRow(id, LAYOUT_GRID_CM)}
              onStep={(d) => ws.resizeStripRow(id, d)}
            />
          )}
          {editable && (
            <Stepper
              label={p.row_spacing_cm ? `Sorok · sortáv ${nf.format(p.row_spacing_cm)} cm` : 'Sorok'}
              value={p.rows ?? 1}
              unit="sor"
              step={1}
              canLess={(p.rows ?? 1) > 1}
              canMore={(p.rows ?? 1) < 50}
              onStep={(d) => ws.setRows(id, Math.max(1, (p.rows ?? 1) + d))}
            />
          )}
          {!fixed && placement && visible && (
            <>
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
            </>
          )}
          {editable && (
            <FormRow label={p.in_row_spacing_cm ? `Tőszám · tőtáv ${nf.format(p.in_row_spacing_cm)} cm` : 'Tőszám'}>
              <NumberInput
                value={p.plant_count}
                min={0}
                placeholder={estimate ? `kb. ${estimate}` : undefined}
                onChange={(v) => edit({ plant_count: v })}
              />
            </FormRow>
          )}
        </PanelGroup>
      )}

      {editable && linked > 0 && (
        <PanelGroup title="Kapcsolt sávok">
          <FormRow label={`Kapcsolt sávokon is (${linked})`}>
            <Toggle checked={ws.linkOn} onChange={ws.setLinkOn} label={`Kapcsolt sávokon is (${linked})`} />
          </FormRow>
          <p className={s.groupFoot}>
            Ugyanilyen ültetések ebben az ágyásban (szaggatott keret). A fajta, a vetőmag, az időszak, a módszer és a dátumok változása
            rájuk is átkerül; a helyük, soraik és tőszámuk nem.
          </p>
        </PanelGroup>
      )}

      {p.series_id && !isDraftSeries(p) && (
        <PanelGroup title="Újravetés">
          <p className={s.groupFoot}>
            Újravetés-sorozat, {p.series_index}. vetés (összesen {p.series_size}).
          </p>
          {members
            .filter((m) => m.id !== id)
            .map((m) => (
              <button key={m.id} type="button" className={s.row} onClick={() => ws.showPlanting(m.id)}>
                <span className={s.rowText}>
                  {m.series_index}. vetés
                  <span className={s.sub}>{datesSummary(m, year)}</span>
                </span>
                <ChevronRight size={15} className={s.chevron} />
              </button>
            ))}
        </PanelGroup>
      )}
      {isDraftSeries(p) && (p.series_index ?? 1) > 1 && head && (
        <PanelGroup title="Újravetés">
          <p className={s.groupFoot}>Az újravetés {p.series_index}. vetése. A vetések számát és időközét az első vetésnél állíthatod.</p>
          <button type="button" className={s.row} onClick={() => ws.showPlanting(head.id)}>
            <span className={s.rowText}>Az első vetés</span>
            <ChevronRight size={15} className={s.chevron} />
          </button>
        </PanelGroup>
      )}
      {canSeries && (
        <PanelGroup title="Újravetés">
          <FormRow label="Újravetés">
            <Toggle
              label="Újravetés"
              checked={!!succession}
              onChange={(on) => ws.setSeries(id, on ? seriesDefaults(window, form.dates, { count: 3, interval: 14 }) : null)}
            />
          </FormRow>
          {succession && (
            <>
              <FormRow label="Vetések száma">
                <NumberInput
                  value={succession.count}
                  min={2}
                  max={20}
                  onChange={(v) => v != null && v >= 2 && v <= 20 && ws.setSeries(id, { ...succession, count: v })}
                />
              </FormRow>
              <FormRow label="Időköz">
                <NumberInput
                  value={succession.interval}
                  min={1}
                  max={180}
                  unit="nap"
                  onChange={(v) => v != null && v >= 1 && v <= 180 && ws.setSeries(id, { ...succession, interval: v })}
                />
              </FormRow>
              {members.slice(1).map((m) => {
                const mp = placementOf(m, bed);
                const mStart = occupancyPeriod(m)?.start;
                return (
                  <button key={m.id} type="button" className={s.row} onClick={() => ws.showPlanting(m.id)}>
                    <span className={s.rowText}>
                      {m.series_index}. vetés{mStart ? ` · ${dateInYear(mStart, year)}` : ''}
                      {mp && (
                        <span className={s.sub}>
                          {nf.format(mp.axis_start_cm)}–{nf.format(mp.axis_start_cm + mp.axis_span_cm)} cm
                          {placement && mp.axis_start_cm === placement.axis_start_cm ? ' · ugyanott' : ' · mellette'}
                        </span>
                      )}
                    </span>
                    <ChevronRight size={15} className={s.chevron} />
                  </button>
                );
              })}
            </>
          )}
          {!succession && (
            <p className={s.groupFoot}>
              {window?.succession_days
                ? `${window.succession_days} naponta újravetve folyamatosan szedhető. `
                : ''}
              A további vetések ugyanide kerülnek, ha az előző addigra lekerül, különben mellé.
            </p>
          )}
        </PanelGroup>
      )}

      {editable && (
        <PanelGroup title="Megjegyzés">
          <FormRow label="Megjegyzés" stacked hideLabel>
            <TextArea rows={2} value={p.notes ?? ''} onChange={(e) => edit({ notes: e.target.value || null })} />
          </FormRow>
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
        {!fixed && (
          <button type="button" className={s.danger} onClick={() => ws.remove(id)}>
            <Trash2 size={15} /> Törlés
          </button>
        )}
      </div>

      {/* mentetlen módosításnál a lap előtt a teljes piszkozat mentődik */}
      <PanelGroup>
        <button type="button" className={s.row} disabled={ws.saving} onClick={() => ws.openDetails(id)}>
          <span className={s.rowText}>
            Tény és napló
            <span className={s.sub}>
              {ws.dirty ? 'Előbb menti a módosításokat; ' : ''}tényleges dátumok, hely, termés, bejegyzések – külön lapon
            </span>
          </span>
          <ChevronRight size={15} className={s.chevron} />
        </button>
      </PanelGroup>
    </>
  );
}
