import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  DATA_STATUS,
  DATA_STATUS_LABEL,
  NUTRIENT_LABEL,
  ROTATION_STAGES,
  ROTATION_STAGE_LABEL,
  SUN_LABEL,
  SUN_VALUES,
  type RotationStage,
} from '@shared/labels.ts';
import type { PlantInput } from '@shared/schemas.ts';
import type { Plant } from '@shared/types.ts';
import { FormButton, FormGroup, FormRow, NumberInput, Select, TextArea, TextInput, Toggle } from '../../components/ui/Form.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation, useCropGroups, useFamilies } from '../../lib/queries.ts';

type Form = Omit<PlantInput, 'aliases_en'> & { aliases_text: string };

const EMPTY: Form = {
  name_hu: '',
  name_latin: null,
  family_id: null,
  crop_group_id: null,
  rotation_stage: null,
  nutrient_group: null,
  perennial: false,
  frost_sensitive: false,
  in_row_spacing_cm: null,
  row_spacing_cm: null,
  days_to_harvest: null,
  harvest_duration_days: null,
  seed_viability_years: null,
  sun: null,
  notes: null,
  data_status: 'sajat',
  aliases_text: '',
};

function toForm(p: Plant): Form {
  const { id: _id, code: _code, source: _source, aliases_en, ...rest } = p;
  return { ...rest, aliases_text: aliases_en.join(', ') };
}

interface Props {
  open: boolean;
  onClose: () => void;
  plant?: Plant;
}

export function PlantEditSheet({ open, onClose, plant }: Props) {
  const navigate = useNavigate();
  const { data: families = [] } = useFamilies();
  const { data: groups = [] } = useCropGroups();
  const [form, setForm] = useState<Form>(EMPTY);

  useEffect(() => {
    if (open) setForm(plant ? toForm(plant) : EMPTY);
  }, [open, plant]);

  const save = useApiMutation(
    (f: Form) => {
      const { aliases_text, ...rest } = f;
      const body: PlantInput = {
        ...rest,
        aliases_en: aliases_text.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean),
      };
      return plant ? api.put<Plant>(`/plants/${plant.id}`, body) : api.post<Plant>('/plants', body);
    },
    [qk.plants, qk.families, qk.cropGroups],
  );
  const remove = useApiMutation(() => api.delete(`/plants/${plant!.id}`), [qk.plants, qk.families, qk.cropGroups]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const changeGroup = (groupId: number | null) => {
    const prev = groups.find((g) => g.id === form.crop_group_id);
    const next = groups.find((g) => g.id === groupId);
    setForm((f) => ({
      ...f,
      crop_group_id: groupId,
      // Ha a szakasz eddig a csoportból öröklődött, kövesse az új csoportot
      rotation_stage: f.rotation_stage === (prev?.rotation_stage ?? null) ? (next?.rotation_stage ?? null) : f.rotation_stage,
    }));
  };

  const submit = () =>
    save.mutate(form, {
      onSuccess: (saved) => {
        onClose();
        if (!plant) navigate(`/novenyek/${(saved as Plant).id}`);
      },
    });

  const onDelete = () => {
    if (!plant || !confirm(`Biztosan törlöd: ${plant.name_hu}? A fajtái és időszakai is törlődnek.`)) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        onClose();
        navigate('/novenyek');
      },
    });
  };

  return (
    <Sheet
      title={plant ? plant.name_hu : 'Új növény'}
      open={open}
      onClose={onClose}
      onConfirm={submit}
      confirmDisabled={!form.name_hu.trim()}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <FormGroup>
        <FormRow label="Név">
          <TextInput value={form.name_hu} onChange={(e) => set('name_hu', e.target.value)} placeholder="pl. Paradicsom" />
        </FormRow>
        <FormRow label="Latin név">
          <TextInput value={form.name_latin ?? ''} onChange={(e) => set('name_latin', e.target.value)} placeholder="nem kötelező" />
        </FormRow>
      </FormGroup>

      <FormGroup title="Besorolás" footer="A vetésforgó-szakasz a zöldségcsoportból öröklődik, de felülírható.">
        <FormRow label="Család">
          <Select value={form.family_id ?? ''} onChange={(e) => set('family_id', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name_hu}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Zöldségcsoport">
          <Select value={form.crop_group_id ?? ''} onChange={(e) => changeGroup(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name_hu}
              </option>
            ))}
          </Select>
        </FormRow>
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
        <FormRow label="Tápanyagigény">
          <Select
            value={form.nutrient_group ?? ''}
            onChange={(e) => set('nutrient_group', e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : null)}
          >
            <option value="">—</option>
            {([1, 2, 3] as const).map((n) => (
              <option key={n} value={n}>
                {NUTRIENT_LABEL[n]}
              </option>
            ))}
          </Select>
        </FormRow>
      </FormGroup>

      <FormGroup title="Termesztés">
        <FormRow label="Tőtáv">
          <NumberInput value={form.in_row_spacing_cm} onChange={(v) => set('in_row_spacing_cm', v)} unit="cm" min={0} />
        </FormRow>
        <FormRow label="Sortáv">
          <NumberInput value={form.row_spacing_cm} onChange={(v) => set('row_spacing_cm', v)} unit="cm" min={0} />
        </FormRow>
        <FormRow label="Betakarításig">
          <NumberInput value={form.days_to_harvest} onChange={(v) => set('days_to_harvest', v)} unit="nap" min={0} />
        </FormRow>
        <FormRow label="Szedési időszak hossza">
          <NumberInput value={form.harvest_duration_days} onChange={(v) => set('harvest_duration_days', v)} unit="nap" min={0} />
        </FormRow>
        <FormRow label="Fényigény">
          <Select value={form.sun ?? ''} onChange={(e) => set('sun', (e.target.value || null) as Form['sun'])}>
            <option value="">—</option>
            {SUN_VALUES.map((v) => (
              <option key={v} value={v}>
                {SUN_LABEL[v]}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Évelő">
          <Toggle checked={form.perennial} onChange={(v) => set('perennial', v)} label="Évelő" />
        </FormRow>
        <FormRow label="Fagyérzékeny">
          <Toggle checked={form.frost_sensitive} onChange={(v) => set('frost_sensitive', v)} label="Fagyérzékeny" />
        </FormRow>
      </FormGroup>
      <FormGroup footer="A napok a vetéstől (helyrevetés) vagy a kiültetéstől (palánta) számítanak az első szedésig.">
        <FormRow label="Csírázóképesség">
          <NumberInput value={form.seed_viability_years} onChange={(v) => set('seed_viability_years', v)} unit="év" min={0} />
        </FormRow>
      </FormGroup>

      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked>
          <TextArea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Termesztési tudnivalók" />
        </FormRow>
      </FormGroup>

      <FormGroup title="Adat" footer="Az angol nevek a társítási adatbázis párosításához kellenek (vesszővel elválasztva).">
        <FormRow label="Állapot">
          <Select value={form.data_status} onChange={(e) => set('data_status', e.target.value as Form['data_status'])}>
            {DATA_STATUS.map((d) => (
              <option key={d} value={d}>
                {DATA_STATUS_LABEL[d]}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow label="Angol nevek">
          <TextInput value={form.aliases_text} onChange={(e) => set('aliases_text', e.target.value)} placeholder="tomato, tomatoes" />
        </FormRow>
      </FormGroup>

      {plant && (
        <FormGroup>
          <FormButton destructive onClick={onDelete}>
            Növény törlése
          </FormButton>
        </FormGroup>
      )}
    </Sheet>
  );
}
