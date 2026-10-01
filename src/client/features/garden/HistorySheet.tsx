import { useEffect, useState } from 'react';
import type { PlantingCreateInput } from '@shared/schemas.ts';
import type { Bed } from '@shared/types.ts';
import { bedAxes } from '@shared/domain/geometry.ts';
import { FormButton, FormGroup, FormRow, NumberInput, Select, TextArea, Toggle } from '../../components/ui/Form.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation, usePlants } from '../../lib/queries.ts';

interface Form {
  year: number;
  plantIds: (number | null)[];
  wholeBed: boolean;
  start: number | null;
  span: number | null;
  notes: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  bed: Bed;
  /** Az előre kiválasztott év */
  year: number;
}

/**
 * Gyors előzmény: mi állt az ágyásban egy korábbi évben. Az év kötelező, a dátumok nem kellenek –
 * a vetésforgó-ellenőrzésnek ennyi is elég.
 */
export function HistorySheet({ open, onClose, bed, year }: Props) {
  const { data: plants = [] } = usePlants();
  const [form, setForm] = useState<Form>({ year, plantIds: [null], wholeBed: true, start: null, span: null, notes: '' });
  const { axis } = bedAxes(bed);
  const axisName = bed.row_direction === 'keresztben' ? 'hossza' : 'szélessége';

  useEffect(() => {
    if (open) setForm({ year, plantIds: [null], wholeBed: true, start: 0, span: Math.round(axis / 2), notes: '' });
  }, [open, year, axis]);

  const chosen = form.plantIds.filter((id): id is number => id != null);
  const save = useApiMutation(async (f: Form) => {
    for (const plantId of [...new Set(chosen)]) {
      const body: PlantingCreateInput = {
        year: f.year,
        plant_id: plantId,
        bed_id: bed.id,
        is_history: true,
        axis_start_cm: f.wholeBed ? null : f.start,
        axis_span_cm: f.wholeBed ? null : f.span,
        notes: f.notes,
      };
      await api.post('/plantings', body);
    }
  }, [qk.plantings, qk.beds]);

  const newest = Math.max(new Date().getFullYear(), year);
  const years = Array.from({ length: 16 }, (_, i) => newest - i);
  const setPlant = (i: number, id: number | null) =>
    setForm((f) => ({ ...f, plantIds: f.plantIds.map((x, n) => (n === i ? id : x)) }));

  return (
    <Sheet
      title="Előzmény rögzítése"
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(form, { onSuccess: onClose })}
      confirmDisabled={!form.year || !chosen.length || (!form.wholeBed && !form.span)}
      busy={save.isPending}
      error={errorMessage(save.error)}
    >
      <FormGroup footer={`Mi állt ebben az ágyásban (${bed.name}) a kiválasztott évben? Elég az év és a növény – a pontos dátumok nem kellenek.`}>
        <FormRow label="Év">
          <Select value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </FormRow>
      </FormGroup>

      <FormGroup title="Növények">
        {form.plantIds.map((id, i) => (
          <FormRow key={i} label={`${i + 1}. növény`}>
            <Select value={id ?? ''} onChange={(e) => setPlant(i, e.target.value ? Number(e.target.value) : null)}>
              <option value="">Válassz…</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_hu}
                </option>
              ))}
            </Select>
          </FormRow>
        ))}
        <FormButton onClick={() => setForm((f) => ({ ...f, plantIds: [...f.plantIds, null] }))}>＋ Még egy növény</FormButton>
      </FormGroup>

      <FormGroup
        title="Hely"
        footer={
          form.wholeBed
            ? 'Ha nem tudod pontosan, hol állt, maradjon az egész ágyás – így a teljes ágyásra figyelmeztet a vetésforgó.'
            : `Sáv az ágyás ${axisName} mentén (${axis} cm), az ágyás elejétől mérve.`
        }
      >
        <FormRow label="Az egész ágyás">
          <Toggle checked={form.wholeBed} onChange={(v) => setForm((f) => ({ ...f, wholeBed: v }))} label="Az egész ágyás" />
        </FormRow>
        {!form.wholeBed && (
          <>
            <FormRow label="Kezdete">
              <NumberInput value={form.start} min={0} unit="cm" onChange={(v) => setForm((f) => ({ ...f, start: v }))} />
            </FormRow>
            <FormRow label="Sáv szélessége">
              <NumberInput value={form.span} min={1} unit="cm" onChange={(v) => setForm((f) => ({ ...f, span: v }))} />
            </FormRow>
          </>
        )}
      </FormGroup>

      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="pl. gyenge termés, lisztharmat" />
        </FormRow>
      </FormGroup>
    </Sheet>
  );
}
