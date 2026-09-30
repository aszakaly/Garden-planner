import { useEffect, useState } from 'react';
import { ROTATION_STAGES, ROTATION_STAGE_LABEL, type RotationStage } from '@shared/labels.ts';
import type { CropGroupInput, FamilyInput } from '@shared/schemas.ts';
import type { CropGroup, PlantFamily } from '@shared/types.ts';
import { FormButton, FormGroup, FormRow, NumberInput, Select, TextArea, TextInput } from '../../components/ui/Form.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation } from '../../lib/queries.ts';

interface Props<T> {
  open: boolean;
  onClose: () => void;
  item?: T;
}

export function FamilyEditSheet({ open, onClose, item }: Props<PlantFamily>) {
  const [form, setForm] = useState<FamilyInput>({ name_hu: '', name_latin: null, rotation_gap_years: 3, notes: null });
  useEffect(() => {
    if (open)
      setForm(
        item
          ? { name_hu: item.name_hu, name_latin: item.name_latin, rotation_gap_years: item.rotation_gap_years, notes: item.notes }
          : { name_hu: '', name_latin: null, rotation_gap_years: 3, notes: null },
      );
  }, [open, item?.id]);
  const invalidate = [qk.families, qk.plants];
  const save = useApiMutation((f: FamilyInput) => (item ? api.put(`/families/${item.id}`, f) : api.post('/families', f)), invalidate);
  const remove = useApiMutation(() => api.delete(`/families/${item!.id}`), invalidate);
  const set = <K extends keyof FamilyInput>(k: K, v: FamilyInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Sheet
      title={item ? item.name_hu : 'Új növénycsalád'}
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(form, { onSuccess: onClose })}
      confirmDisabled={!form.name_hu.trim()}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <FormGroup>
        <FormRow label="Név">
          <TextInput value={form.name_hu} onChange={(e) => set('name_hu', e.target.value)} />
        </FormRow>
        <FormRow label="Latin név">
          <TextInput value={form.name_latin ?? ''} onChange={(e) => set('name_latin', e.target.value)} />
        </FormRow>
      </FormGroup>
      <FormGroup footer="Ennyi évig ne kerüljön ugyanabból a családból növény ugyanarra a helyre.">
        <FormRow label="Vetésforgó-szünet">
          <NumberInput value={form.rotation_gap_years} onChange={(v) => set('rotation_gap_years', v ?? 1)} unit="év" min={1} max={10} />
        </FormRow>
      </FormGroup>
      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </FormRow>
      </FormGroup>
      {item && (
        <FormGroup footer={item.plant_count ? `${item.plant_count} növény tartozik ide; törlés után besorolás nélkül maradnak.` : undefined}>
          <FormButton destructive onClick={() => confirm(`Törlöd: ${item.name_hu}?`) && remove.mutate(undefined, { onSuccess: onClose })}>
            Család törlése
          </FormButton>
        </FormGroup>
      )}
    </Sheet>
  );
}

export function CropGroupEditSheet({ open, onClose, item }: Props<CropGroup>) {
  const empty: CropGroupInput = { name_hu: '', description: null, rotation_stage: null, sort_order: 50 };
  const [form, setForm] = useState<CropGroupInput>(empty);
  useEffect(() => {
    if (open)
      setForm(
        item
          ? { name_hu: item.name_hu, description: item.description, rotation_stage: item.rotation_stage, sort_order: item.sort_order }
          : empty,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);
  const invalidate = [qk.cropGroups, qk.plants];
  const save = useApiMutation(
    (f: CropGroupInput) => (item ? api.put(`/crop-groups/${item.id}`, f) : api.post('/crop-groups', f)),
    invalidate,
  );
  const remove = useApiMutation(() => api.delete(`/crop-groups/${item!.id}`), invalidate);
  const set = <K extends keyof CropGroupInput>(k: K, v: CropGroupInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Sheet
      title={item ? item.name_hu : 'Új zöldségcsoport'}
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(form, { onSuccess: onClose })}
      confirmDisabled={!form.name_hu.trim()}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <FormGroup>
        <FormRow label="Név">
          <TextInput value={form.name_hu} onChange={(e) => set('name_hu', e.target.value)} />
        </FormRow>
        <FormRow label="Leírás" stacked>
          <TextArea rows={3} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </FormRow>
      </FormGroup>
      <FormGroup footer="Az ide tartozó új növények ezt a vetésforgó-szakaszt kapják alapértelmezésként.">
        <FormRow label="Vetésforgó-szakasz">
          <Select
            value={form.rotation_stage ?? ''}
            onChange={(e) => set('rotation_stage', (e.target.value || null) as RotationStage | null)}
          >
            <option value="">Vetésforgón kívül</option>
            {ROTATION_STAGES.map((st) => (
              <option key={st} value={st}>
                {ROTATION_STAGE_LABEL[st]}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Sorrend">
          <NumberInput value={form.sort_order} onChange={(v) => set('sort_order', v ?? 0)} min={0} />
        </FormRow>
      </FormGroup>
      {item && (
        <FormGroup>
          <FormButton destructive onClick={() => confirm(`Törlöd: ${item.name_hu}?`) && remove.mutate(undefined, { onSuccess: onClose })}>
            Zöldségcsoport törlése
          </FormButton>
        </FormGroup>
      )}
    </Sheet>
  );
}
