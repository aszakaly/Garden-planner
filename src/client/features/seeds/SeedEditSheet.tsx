import { useEffect, useMemo, useState } from 'react';
import { SEED_ORIGINS, SEED_ORIGIN_LABEL, type SeedOrigin } from '@shared/labels.ts';
import type { SeedStockInput } from '@shared/schemas.ts';
import type { SeedStockListItem } from '@shared/types.ts';
import { FormButton, FormGroup, FormRow, NumberInput, Select, TextArea, TextInput, Toggle } from '../../components/ui/Form.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { withArticle } from '../../lib/format.ts';
import { qk, useApiMutation, usePlants, useVarieties } from '../../lib/queries.ts';
import s from './SeedEditSheet.module.css';

const NEW_VARIETY = -1;

interface Form {
  plant_id: number | null;
  variety_id: number | null;
  variety_name: string;
  supplier: string;
  origin_type: SeedOrigin;
  vintage_year: number | null;
  in_stock: boolean;
  quantity: string;
  notes: string;
}

const empty = (plantId: number | null = null): Form => ({
  plant_id: plantId,
  variety_id: null,
  variety_name: '',
  supplier: '',
  origin_type: 'vasarolt',
  vintage_year: new Date().getFullYear(),
  in_stock: true,
  quantity: '',
  notes: '',
});

interface Props {
  open: boolean;
  onClose: () => void;
  seed?: SeedStockListItem;
  /** Új tételnél előre kiválasztott növény */
  plantId?: number;
}

export function SeedEditSheet({ open, onClose, seed, plantId }: Props) {
  const { data: plants = [] } = usePlants();
  const { data: varieties = [] } = useVarieties();
  const [form, setForm] = useState<Form>(empty());

  useEffect(() => {
    if (!open) return;
    setForm(
      seed
        ? {
            plant_id: seed.plant_id,
            variety_id: seed.variety_id,
            variety_name: '',
            supplier: seed.supplier ?? '',
            origin_type: seed.origin_type,
            vintage_year: seed.vintage_year,
            in_stock: seed.in_stock,
            quantity: seed.quantity ?? '',
            notes: seed.notes ?? '',
          }
        : empty(plantId ?? null),
    );
  }, [open, seed?.id, plantId]);

  const plantVarieties = useMemo(() => varieties.filter((v) => v.plant_id === form.plant_id), [varieties, form.plant_id]);
  const plant = plants.find((p) => p.id === form.plant_id);
  // Ha a növénynek még nincs fajtája, rögtön új fajtát kérünk
  const isNewVariety = form.variety_id === NEW_VARIETY || (form.plant_id !== null && plantVarieties.length === 0);

  const invalidate = [qk.seeds, qk.varieties, qk.plants, ['plants']];
  const save = useApiMutation((f: Form) => {
    const body: SeedStockInput = {
      variety_id: isNewVariety ? null : f.variety_id,
      plant_id: f.plant_id,
      variety_name: isNewVariety ? f.variety_name : null,
      supplier: f.supplier,
      origin_type: f.origin_type,
      vintage_year: f.vintage_year,
      in_stock: f.in_stock,
      quantity: f.quantity,
      notes: f.notes,
    };
    return seed ? api.put(`/seeds/${seed.id}`, body) : api.post('/seeds', body);
  }, invalidate);
  const remove = useApiMutation(() => api.delete(`/seeds/${seed!.id}`), invalidate);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const canSave = !!form.plant_id && (isNewVariety ? !!form.variety_name.trim() : !!form.variety_id);
  const viabilityYears = plant?.seed_viability_years;

  return (
    <Sheet
      title={seed ? `${seed.plant_name} – ${seed.variety_name}` : 'Új vetőmag'}
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(form, { onSuccess: onClose })}
      confirmDisabled={!canSave}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <FormGroup>
        <FormRow label="Növény">
          <Select
            value={form.plant_id ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, plant_id: e.target.value ? Number(e.target.value) : null, variety_id: null }))}
          >
            <option value="">Válassz…</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name_hu}
              </option>
            ))}
          </Select>
        </FormRow>
        {form.plant_id !== null && plantVarieties.length > 0 && (
          <FormRow label="Fajta">
            <Select value={form.variety_id ?? ''} onChange={(e) => set('variety_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Válassz…</option>
              {plantVarieties.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
              <option value={NEW_VARIETY}>＋ Új fajta…</option>
            </Select>
          </FormRow>
        )}
        {isNewVariety && (
          <FormRow label="Új fajta neve">
            <TextInput value={form.variety_name} onChange={(e) => set('variety_name', e.target.value)} placeholder="pl. Ökörszív" />
          </FormRow>
        )}
      </FormGroup>

      <div className={s.segment}>
        <SegmentedControl<SeedOrigin>
          label="Eredet"
          value={form.origin_type}
          options={SEED_ORIGINS.map((o) => ({ value: o, label: SEED_ORIGIN_LABEL[o] }))}
          onChange={(v) => set('origin_type', v)}
        />
      </div>

      <FormGroup
        footer={
          viabilityYears
            ? `${withArticle(plant!.name_hu.toLowerCase(), true)} magja kb. ${viabilityYears} évig csírázik jól${
                form.vintage_year ? ` – ez a tétel ${form.vintage_year + viabilityYears}-ig használható biztonsággal` : ''
              }.`
            : undefined
        }
      >
        <FormRow label="Évjárat">
          <NumberInput value={form.vintage_year} onChange={(v) => set('vintage_year', v)} min={1950} max={2200} placeholder="pl. 2025" />
        </FormRow>
        <FormRow label={form.origin_type === 'vasarolt' ? 'Beszerzés helye' : 'Forrás'}>
          <TextInput
            value={form.supplier}
            onChange={(e) => set('supplier', e.target.value)}
            placeholder={form.origin_type === 'sajat' ? 'pl. saját kert, 2. ágyás' : 'pl. gazdabolt, magcsere'}
          />
        </FormRow>
        <FormRow label="Mennyiség">
          <TextInput value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="pl. 1 tasak, kb. 50 szem" />
        </FormRow>
        <FormRow label="Készleten van">
          <Toggle checked={form.in_stock} onChange={(v) => set('in_stock', v)} label="Készleten van" />
        </FormRow>
      </FormGroup>

      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </FormRow>
      </FormGroup>

      {seed && (
        <FormGroup>
          <FormButton destructive onClick={() => confirm('Törlöd ezt a vetőmagtételt?') && remove.mutate(undefined, { onSuccess: onClose })}>
            Tétel törlése
          </FormButton>
        </FormGroup>
      )}
    </Sheet>
  );
}
