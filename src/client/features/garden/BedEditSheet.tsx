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
import { numberedNames } from '@shared/domain/beds.ts';
import type { BedInput } from '@shared/schemas.ts';
import type { Bed } from '@shared/types.ts';
import { ColorPicker } from '../../components/ui/ColorPicker.tsx';
import { FormButton, FormGroup, FormRow, NumberInput, Select, TextArea, TextInput } from '../../components/ui/Form.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { formatArea } from '../../lib/beds.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation, useBeds } from '../../lib/queries.ts';
import { useYear } from '../../lib/year.tsx';
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

/** Új ágyás egy meglévő adataiból: sorszámozott névvel; a helye és a sorrendje nem öröklődik. */
function fromTemplate(t: Bed, takenNames: string[]): Form {
  return {
    ...EMPTY,
    name: numberedNames(t.name, 1, [...takenNames, t.name])[0]!,
    color: t.color,
    length_cm: t.length_cm,
    width_cm: t.width_cm,
    row_direction: t.row_direction,
    rotation_deg: t.rotation_deg,
    bed_type: t.bed_type,
    sun: t.sun,
    soil: t.soil,
    irrigation: t.irrigation,
    notes: t.notes,
    active_from_year: t.active_from_year,
    active_to_year: t.active_to_year,
  };
}

/** „Emelt ágyás 2, Emelt ágyás 3, … Emelt ágyás 11” */
function previewNames(names: string[]): string {
  return names.length <= 3 ? names.join(', ') : `${names[0]}, ${names[1]}, … ${names.at(-1)}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  bed?: Bed;
  /** Új ágyásnál: ennek az adataival indul a lap (ágyás másolása). */
  template?: Bed;
}

export function BedEditSheet({ open, onClose, bed, template }: Props) {
  const navigate = useNavigate();
  const { year } = useYear();
  const { data: beds = [] } = useBeds(year);
  const takenNames = beds.map((b) => b.name);
  const [form, setForm] = useState<Form>(EMPTY);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(1);
  useEffect(() => {
    if (!open) return;
    if (bed) {
      const { id: _id, garden_id: _g, ...rest } = bed;
      setForm(rest);
    } else setForm(template ? fromTemplate(template, takenNames) : EMPTY);
    setTemplateId(template?.id ?? null);
    setCount(1);
  }, [open, bed?.id, template?.id]);

  const pickTemplate = (id: number | null) => {
    const t = beds.find((b) => b.id === id);
    setTemplateId(t?.id ?? null);
    setForm(t ? fromTemplate(t, takenNames) : EMPTY);
  };

  const invalidate = [qk.beds, qk.plantings];
  const save = useApiMutation(
    (f: Form): Promise<Bed | Bed[]> =>
      bed
        ? api.put<Bed>(`/beds/${bed.id}`, f)
        : count && count > 1
          ? api.post<Bed[]>('/beds/batch', { bed: f, count })
          : api.post<Bed>('/beds', f),
    invalidate,
  );
  const remove = useApiMutation(() => api.delete(`/beds/${bed!.id}`), invalidate);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () =>
    save.mutate(form, {
      onSuccess: (saved) => {
        onClose();
        if (bed) return;
        // Több ágyás után a kertlista mutatja őket, egy után az új ágyás oldala nyílik meg
        navigate(Array.isArray(saved) ? '/kert' : `/agyas/${saved.id}`);
      },
    });

  const hasSize = !!form.length_cm && !!form.width_cm;
  const validCount = count != null && Number.isInteger(count) && count >= 1 && count <= 50;
  const batchNames = !bed && validCount && count > 1 && form.name.trim() ? numberedNames(form.name, count, takenNames) : [];

  return (
    <Sheet
      title={bed ? bed.name : 'Új ágyás'}
      open={open}
      onClose={onClose}
      onConfirm={submit}
      confirmDisabled={!form.name.trim() || !hasSize || (!bed && !validCount)}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      {!bed && beds.length > 0 && (
        <FormGroup footer="Egy meglévő ágyás méretét, típusát és adottságait tölti be. Az ültetései, az előzményei és a helye nem másolódnak.">
          <FormRow label="Minta">
            <Select value={templateId ?? ''} onChange={(e) => pickTemplate(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Nincs (üres lap)</option>
              {beds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FormRow>
        </FormGroup>
      )}

      <FormGroup>
        <FormRow label="Név">
          <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="pl. Emelt ágyás 1" />
        </FormRow>
        <FormRow label="Szín" stacked>
          <ColorPicker value={form.color} onChange={(c) => set('color', c)} />
        </FormRow>
      </FormGroup>

      {!bed && (
        <FormGroup
          footer={
            batchNames.length > 1
              ? `${batchNames.length} ágyás jön létre: ${previewNames(batchNames)}.`
              : 'Több egyforma ágyásnál add meg, hányat hozzon létre; a nevük sorszámot kap.'
          }
        >
          <FormRow label="Darabszám">
            <NumberInput value={count} onChange={setCount} unit="db" min={1} max={50} />
          </FormRow>
        </FormGroup>
      )}

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
