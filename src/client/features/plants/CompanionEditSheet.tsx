import { useEffect, useState } from 'react';
import type { CompanionView } from '@shared/types.ts';
import { FormButton, FormGroup, FormRow, Select, TextArea } from '../../components/ui/Form.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation, usePlants } from '../../lib/queries.ts';
import s from './editSheets.module.css';

type Relation = -1 | 0 | 1;

interface Props {
  open: boolean;
  onClose: () => void;
  plantId: number;
  plantName: string;
  companion?: CompanionView;
}

export function CompanionEditSheet({ open, onClose, plantId, plantName, companion }: Props) {
  const { data: plants = [] } = usePlants();
  const [other, setOther] = useState<number | null>(null);
  const [relation, setRelation] = useState<Relation>(1);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setOther(companion?.other_plant_id ?? null);
    setRelation(companion?.relation ?? 1);
    setReason(companion?.reason ?? '');
  }, [open, companion?.id]);

  const invalidate = [qk.plants, ['plants'], qk.companions];
  const save = useApiMutation(
    () => api.put('/companions', { plant_a_id: plantId, plant_b_id: other, relation, reason }),
    invalidate,
  );
  const remove = useApiMutation(() => api.delete(`/companions/${companion!.id}`), invalidate);

  return (
    <Sheet
      title={companion ? `${plantName} + ${companion.other_plant_name}` : 'Új társítás'}
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(undefined, { onSuccess: onClose })}
      confirmDisabled={!other}
      busy={save.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <FormGroup>
        <FormRow label={`${plantName} mellé`}>
          <Select value={other ?? ''} disabled={!!companion} onChange={(e) => setOther(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Válassz növényt…</option>
            {plants
              .filter((p) => p.id !== plantId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_hu}
                </option>
              ))}
          </Select>
        </FormRow>
      </FormGroup>

      <div className={s.segments}>
        <SegmentedControl<Relation>
          label="Kapcsolat"
          value={relation}
          options={[
            { value: 1, label: 'Kedvező' },
            { value: 0, label: 'Semleges' },
            { value: -1, label: 'Kerülendő' },
          ]}
          onChange={setRelation}
        />
      </div>

      <FormGroup title="Indoklás" footer="A saját bejegyzés felülírja az adatbázisból származó értéket.">
        <FormRow label="Indoklás" stacked>
          <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="pl. saját tapasztalat szerint elnyomja" />
        </FormRow>
      </FormGroup>

      {companion?.evidence?.eredeti && (
        <p className={s.hint}>
          Eredeti forrásszöveg: „{companion.evidence.eredeti}” ({companion.evidence.kedvezo ?? 0} kedvező /{' '}
          {companion.evidence.kerulendo ?? 0} kerülendő bejegyzés alapján)
        </p>
      )}

      {companion && (
        <FormGroup>
          <FormButton destructive onClick={() => remove.mutate(undefined, { onSuccess: onClose })}>
            Társítás törlése
          </FormButton>
        </FormGroup>
      )}
    </Sheet>
  );
}
