import { useEffect, useState } from 'react';
import { SEASONS, SEASON_LABEL, WINDOW_METHODS, type Season, type WindowMethod } from '@shared/labels.ts';
import type { WindowInput } from '@shared/schemas.ts';
import type { GrowingWindow } from '@shared/types.ts';
import { FormButton, FormGroup, FormRow, MonthDayInput, NumberInput, TextArea, Toggle } from '../../components/ui/Form.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation } from '../../lib/queries.ts';
import s from './editSheets.module.css';

const EMPTY: WindowInput = {
  season: 'tavaszi',
  method: 'helyrevetes',
  sow_start: null,
  sow_end: null,
  seedling_weeks: null,
  transplant_start: null,
  transplant_end: null,
  harvest_start: null,
  harvest_end: null,
  harvest_year_offset: 0,
  succession_days: null,
  notes: null,
};

const METHOD_SHORT: Record<WindowMethod, string> = { helyrevetes: 'Helyrevetés', palanta: 'Palánta', ultetes: 'Ültetés' };

interface Props {
  open: boolean;
  onClose: () => void;
  plantId: number;
  /** Ha fajtához tartozik az időszak */
  varietyId?: number;
  window?: GrowingWindow;
}

export function WindowEditSheet({ open, onClose, plantId, varietyId, window: w }: Props) {
  const [form, setForm] = useState<WindowInput>(EMPTY);
  useEffect(() => {
    if (!open) return;
    if (w) {
      const { id: _i, plant_id: _p, variety_id: _v, ...rest } = w;
      setForm(rest);
    } else setForm(EMPTY);
  }, [open, w]);

  const invalidate = [qk.plant(plantId), qk.plants];
  const save = useApiMutation(
    (f: WindowInput) =>
      w
        ? api.put(`/windows/${w.id}`, f)
        : api.post(varietyId ? `/varieties/${varietyId}/windows` : `/plants/${plantId}/windows`, f),
    invalidate,
  );
  const remove = useApiMutation(() => api.delete(`/windows/${w!.id}`), invalidate);

  const set = <K extends keyof WindowInput>(key: K, value: WindowInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const sowTitle = form.method === 'palanta' ? 'Vetés palántának' : form.method === 'ultetes' ? 'Ültetés' : 'Vetés';

  return (
    <Sheet
      title={w ? 'Időszak szerkesztése' : 'Új időszak'}
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(form, { onSuccess: onClose })}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <div className={s.segments}>
        <SegmentedControl<Season>
          label="Szezon"
          value={form.season}
          options={SEASONS.map((v) => ({ value: v, label: SEASON_LABEL[v] }))}
          onChange={(v) => set('season', v)}
        />
        <SegmentedControl<WindowMethod>
          label="Módszer"
          value={form.method}
          options={WINDOW_METHODS.map((v) => ({ value: v, label: METHOD_SHORT[v] }))}
          onChange={(v) => set('method', v)}
        />
      </div>

      <FormGroup title={sowTitle}>
        <FormRow label="Kezdete">
          <MonthDayInput value={form.sow_start} onChange={(v) => set('sow_start', v)} />
        </FormRow>
        <FormRow label="Vége">
          <MonthDayInput value={form.sow_end} onChange={(v) => set('sow_end', v)} />
        </FormRow>
      </FormGroup>

      {form.method === 'palanta' && (
        <FormGroup title="Palántanevelés és kiültetés">
          <FormRow label="Nevelés hossza">
            <NumberInput value={form.seedling_weeks} onChange={(v) => set('seedling_weeks', v)} unit="hét" min={1} />
          </FormRow>
          <FormRow label="Kiültetés kezdete">
            <MonthDayInput value={form.transplant_start} onChange={(v) => set('transplant_start', v)} />
          </FormRow>
          <FormRow label="Kiültetés vége">
            <MonthDayInput value={form.transplant_end} onChange={(v) => set('transplant_end', v)} />
          </FormRow>
        </FormGroup>
      )}

      <FormGroup title="Betakarítás" footer="Áttelelő kultúránál (pl. őszi fokhagyma) kapcsold be a „Következő évben” beállítást.">
        <FormRow label="Kezdete">
          <MonthDayInput value={form.harvest_start} onChange={(v) => set('harvest_start', v)} />
        </FormRow>
        <FormRow label="Vége">
          <MonthDayInput value={form.harvest_end} onChange={(v) => set('harvest_end', v)} />
        </FormRow>
        <FormRow label="Következő évben">
          <Toggle
            checked={form.harvest_year_offset === 1}
            onChange={(v) => set('harvest_year_offset', v ? 1 : 0)}
            label="Betakarítás a következő évben"
          />
        </FormRow>
      </FormGroup>

      <FormGroup footer="Folyamatos szedéshez: ennyi naponként érdemes újravetni (pl. retek, saláta).">
        <FormRow label="Újravetés">
          <NumberInput value={form.succession_days} onChange={(v) => set('succession_days', v)} unit="naponta" min={1} />
        </FormRow>
      </FormGroup>

      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={2} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </FormRow>
      </FormGroup>

      {w && (
        <FormGroup>
          <FormButton destructive onClick={() => confirm('Törlöd ezt az időszakot?') && remove.mutate(undefined, { onSuccess: onClose })}>
            Időszak törlése
          </FormButton>
        </FormGroup>
      )}
    </Sheet>
  );
}
