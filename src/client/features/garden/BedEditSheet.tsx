import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  BED_TYPES,
  BED_TYPE_DESCRIPTION,
  BED_TYPE_LABEL,
  ROW_DIRECTIONS,
  ROW_DIRECTION_LABEL,
  SUN_LABEL,
  SUN_VALUES,
  type RowDirection,
} from '@shared/labels.ts';
import type { BedInput } from '@shared/schemas.ts';
import type { Bed } from '@shared/types.ts';
import { ColorPicker } from '../../components/ui/ColorPicker.tsx';
import { FormButton, FormGroup, FormRow, NumberInput, Select, TextArea, TextInput } from '../../components/ui/Form.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { formatArea } from '../../lib/beds.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation } from '../../lib/queries.ts';
import s from './BedEditSheet.module.css';

type Form = Omit<BedInput, 'length_cm' | 'width_cm'> & { length_cm: number | null; width_cm: number | null };

const EMPTY: Form = {
  name: '',
  color: 'green',
  length_cm: null,
  width_cm: null,
  row_direction: 'keresztben',
  pos_x_cm: null,
  pos_y_cm: null,
  rotation_deg: 0,
  bed_type: 'foldagyas',
  sun: 'napos',
  soil: null,
  irrigation: null,
  notes: null,
  active_from_year: new Date().getFullYear(),
  active_to_year: null,
  sort_order: 0,
};

interface Props {
  open: boolean;
  onClose: () => void;
  bed?: Bed;
}

export function BedEditSheet({ open, onClose, bed }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(EMPTY);
  useEffect(() => {
    if (!open) return;
    if (bed) {
      const { id: _id, garden_id: _g, ...rest } = bed;
      setForm(rest);
    } else setForm(EMPTY);
  }, [open, bed?.id]);

  const invalidate = [qk.beds, qk.plantings];
  const save = useApiMutation((f: Form) => (bed ? api.put<Bed>(`/beds/${bed.id}`, f) : api.post<Bed>('/beds', f)), invalidate);
  const remove = useApiMutation(() => api.delete(`/beds/${bed!.id}`), invalidate);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () =>
    save.mutate(form, {
      onSuccess: (saved) => {
        onClose();
        if (!bed) navigate(`/agyas/${(saved as Bed).id}`);
      },
    });

  const hasSize = !!form.length_cm && !!form.width_cm;

  return (
    <Sheet
      title={bed ? bed.name : 'Új ágyás'}
      open={open}
      onClose={onClose}
      onConfirm={submit}
      confirmDisabled={!form.name.trim() || !hasSize}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <FormGroup>
        <FormRow label="Név">
          <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="pl. Emelt ágyás 1" />
        </FormRow>
        <FormRow label="Szín" stacked>
          <ColorPicker value={form.color} onChange={(c) => set('color', c)} />
        </FormRow>
      </FormGroup>

      <FormGroup title="Méret" footer={hasSize ? `Terület: ${formatArea(form.length_cm!, form.width_cm!)}` : 'A tervezés a méretből számolja a helyet.'}>
        <FormRow label="Hossz">
          <NumberInput value={form.length_cm} onChange={(v) => set('length_cm', v)} unit="cm" min={10} placeholder="pl. 400" />
        </FormRow>
        <FormRow label="Szélesség">
          <NumberInput value={form.width_cm} onChange={(v) => set('width_cm', v)} unit="cm" min={10} placeholder="pl. 120" />
        </FormRow>
      </FormGroup>

      <FormGroup
        title="Sorok iránya"
        footer={
          form.row_direction === 'keresztben'
            ? 'Keresztben: a sorok az ágyás szélességében futnak, és a hossza mentén követik egymást (keskeny, hosszú ágyásnál ez a szokásos).'
            : 'Hosszában: a sorok az ágyás teljes hosszában futnak, és a szélesség mentén követik egymást.'
        }
      >
        <div className={s.segment}>
          <SegmentedControl<RowDirection>
            label="Sorok iránya"
            value={form.row_direction}
            options={ROW_DIRECTIONS.map((d) => ({ value: d, label: ROW_DIRECTION_LABEL[d] }))}
            onChange={(v) => set('row_direction', v)}
          />
        </div>
      </FormGroup>

      <FormGroup title="Típus" footer={BED_TYPE_DESCRIPTION[form.bed_type]}>
        <FormRow label="Típus">
          <Select value={form.bed_type} onChange={(e) => set('bed_type', e.target.value as Form['bed_type'])}>
            {BED_TYPES.map((t) => (
              <option key={t} value={t}>
                {BED_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </FormRow>
      </FormGroup>

      <FormGroup title="Adottságok">
        <FormRow label="Napfény">
          <Select value={form.sun ?? ''} onChange={(e) => set('sun', (e.target.value || null) as Form['sun'])}>
            <option value="">—</option>
            {SUN_VALUES.map((v) => (
              <option key={v} value={v}>
                {SUN_LABEL[v]}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Talaj">
          <TextInput value={form.soil ?? ''} onChange={(e) => set('soil', e.target.value)} placeholder="pl. középkötött, humuszos" />
        </FormRow>
        <FormRow label="Öntözés">
          <TextInput value={form.irrigation ?? ''} onChange={(e) => set('irrigation', e.target.value)} placeholder="pl. csepegtető" />
        </FormRow>
      </FormGroup>

      <FormGroup
        title="Használat"
        footer="Megszűnt vagy átalakított ágyásnál add meg a vége évet (törlés helyett) – így a vetésforgó-előzmények megmaradnak."
      >
        <FormRow label="Első év">
          <NumberInput value={form.active_from_year} onChange={(v) => set('active_from_year', v)} min={1950} max={2200} placeholder="—" />
        </FormRow>
        <FormRow label="Utolsó év">
          <NumberInput value={form.active_to_year} onChange={(v) => set('active_to_year', v)} min={1950} max={2200} placeholder="használatban" />
        </FormRow>
      </FormGroup>

      <FormGroup title="Elhelyezkedés a kertben" footer="A későbbi grafikus kerttérképhez – most nem kötelező. A kert bal felső sarkától mérve.">
        <FormRow label="Vízszintesen (X)">
          <NumberInput value={form.pos_x_cm} onChange={(v) => set('pos_x_cm', v)} unit="cm" placeholder="—" />
        </FormRow>
        <FormRow label="Függőlegesen (Y)">
          <NumberInput value={form.pos_y_cm} onChange={(v) => set('pos_y_cm', v)} unit="cm" placeholder="—" />
        </FormRow>
        <FormRow label="Elforgatás">
          <NumberInput value={form.rotation_deg} onChange={(v) => set('rotation_deg', v ?? 0)} unit="°" min={0} max={359} />
        </FormRow>
      </FormGroup>

      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </FormRow>
      </FormGroup>

      {bed && (
        <FormGroup>
          <FormButton
            destructive
            onClick={() =>
              confirm(`Törlöd: ${bed.name}?`) &&
              remove.mutate(undefined, {
                onSuccess: () => {
                  onClose();
                  navigate('/kert');
                },
              })
            }
          >
            Ágyás törlése
          </FormButton>
        </FormGroup>
      )}
    </Sheet>
  );
}
