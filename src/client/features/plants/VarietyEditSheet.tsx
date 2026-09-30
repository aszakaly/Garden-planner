import { useEffect, useState } from 'react';
import type { VarietyInput } from '@shared/schemas.ts';
import type { Variety } from '@shared/types.ts';
import { FormButton, FormGroup, FormRow, NumberInput, TextArea, TextInput } from '../../components/ui/Form.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation } from '../../lib/queries.ts';

const EMPTY: VarietyInput = {
  name: '',
  description: null,
  days_to_harvest: null,
  in_row_spacing_cm: null,
  row_spacing_cm: null,
  notes: null,
};

interface Props {
  open: boolean;
  onClose: () => void;
  plantId: number;
  plantName: string;
  variety?: Variety;
}

export function VarietyEditSheet({ open, onClose, plantId, plantName, variety }: Props) {
  const [form, setForm] = useState<VarietyInput>(EMPTY);
  useEffect(() => {
    if (!open) return;
    if (variety) {
      const { id: _i, plant_id: _p, ...rest } = variety as Variety & { windows?: unknown };
      delete (rest as { windows?: unknown }).windows;
      setForm(rest);
    } else setForm(EMPTY);
  }, [open, variety?.id]);

  const invalidate = [qk.plant(plantId), qk.plants, qk.varieties];
  const save = useApiMutation(
    (f: VarietyInput) => (variety ? api.put(`/varieties/${variety.id}`, f) : api.post(`/plants/${plantId}/varieties`, f)),
    invalidate,
  );
  const remove = useApiMutation(() => api.delete(`/varieties/${variety!.id}`), invalidate);
  const set = <K extends keyof VarietyInput>(key: K, value: VarietyInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Sheet
      title={variety ? variety.name : `Új ${plantName.toLowerCase()} fajta`}
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(form, { onSuccess: onClose })}
      confirmDisabled={!form.name.trim()}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <FormGroup>
        <FormRow label="Fajtanév">
          <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="pl. Ökörszív" />
        </FormRow>
        <FormRow label="Leírás" stacked>
          <TextArea rows={3} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Szín, méret, íz, érési idő…" />
        </FormRow>
      </FormGroup>

      <FormGroup title="Eltérések a növény adataitól" footer="Csak akkor töltsd ki, ha a fajta eltér a növénynél megadott értékektől.">
        <FormRow label="Betakarításig">
          <NumberInput value={form.days_to_harvest} onChange={(v) => set('days_to_harvest', v)} unit="nap" min={0} />
        </FormRow>
        <FormRow label="Tőtáv">
          <NumberInput value={form.in_row_spacing_cm} onChange={(v) => set('in_row_spacing_cm', v)} unit="cm" min={0} />
        </FormRow>
        <FormRow label="Sortáv">
          <NumberInput value={form.row_spacing_cm} onChange={(v) => set('row_spacing_cm', v)} unit="cm" min={0} />
        </FormRow>
      </FormGroup>

      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </FormRow>
      </FormGroup>

      {variety && (
        <FormGroup>
          <FormButton
            destructive
            onClick={() => confirm(`Törlöd a(z) ${variety.name} fajtát?`) && remove.mutate(undefined, { onSuccess: onClose })}
          >
            Fajta törlése
          </FormButton>
        </FormGroup>
      )}
    </Sheet>
  );
}
