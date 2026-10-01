import { useState, type CSSProperties } from 'react';
import { JOURNAL_TYPE_LABEL, JOURNAL_TYPES, type JournalType } from '@shared/labels.ts';
import type { JournalInput } from '@shared/schemas.ts';
import type { JournalEntry } from '@shared/types.ts';
import { DateInput, FormButton, FormGroup, FormRow, NumberInput, Select, TextArea, TextInput } from '../../components/ui/Form.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { StarRating } from '../../components/ui/StarRating.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { todayISO } from '../../lib/format.ts';
import { qk, useApiMutation, useBeds, usePlantDetail, usePlanting, usePlantings, usePlants } from '../../lib/queries.ts';
import { byStart, plantingTitle } from '../plan/plantingView.ts';
import { JOURNAL_PLACEHOLDER, JOURNAL_TYPE_COLOR, JOURNAL_TYPE_ICON, UNITS } from './journalView.ts';
import s from './Journal.module.css';

/** Új bejegyzés előre kitöltött mezői (a megnyitás helyéről). */
export interface JournalDefaults {
  entry_date?: string;
  entry_type?: JournalType;
  planting_id?: number | null;
  plant_id?: number | null;
  variety_id?: number | null;
  bed_id?: number | null;
}

interface Props {
  entry?: JournalEntry;
  defaults?: JournalDefaults;
  onClose: () => void;
}

/** Naplóbejegyzés felvétele és szerkesztése – visszamenőleges dátummal is. */
export function JournalEntrySheet({ entry, defaults = {}, onClose }: Props) {
  const init = entry ?? defaults;
  const [date, setDate] = useState<string | null>(init.entry_date ?? todayISO());
  const [type, setType] = useState<JournalType>(init.entry_type ?? 'megfigyeles');
  const [plantingId, setPlantingId] = useState<number | null>(init.planting_id ?? null);
  const [plantId, setPlantId] = useState<number | null>(init.plant_id ?? null);
  const [varietyId, setVarietyId] = useState<number | null>(init.variety_id ?? null);
  const [bedId, setBedId] = useState<number | null>(init.bed_id ?? null);
  const [body, setBody] = useState(entry?.body ?? '');
  const [amount, setAmount] = useState<number | null>(entry?.amount ?? null);
  const [unit, setUnit] = useState(entry?.unit ?? 'kg');
  const [quality, setQuality] = useState<number | null>(entry?.quality ?? null);
  const [tags, setTags] = useState(entry?.tags ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const year = Number((date ?? todayISO()).slice(0, 4));
  const { data: plantings = [] } = usePlantings(year);
  const { data: linked } = usePlanting(plantingId);
  const { data: plants = [] } = usePlants();
  const { data: detail } = usePlantDetail(plantId ?? 0);
  const { data: beds = [] } = useBeds(year);
  const options = plantings.filter((p) => !p.is_history).sort(byStart);
  if (linked && !options.some((p) => p.id === linked.id)) options.unshift(linked);
  const varieties = detail?.plant.id === plantId ? detail.varieties : [];
  const showHarvest = type === 'termes' || amount != null;

  const save = useApiMutation(() => {
    const payload: JournalInput = {
      entry_date: date!,
      entry_type: type,
      planting_id: plantingId,
      plant_id: plantingId ? null : plantId,
      variety_id: plantingId ? null : varietyId,
      bed_id: plantingId ? null : bedId,
      body,
      amount,
      unit: amount != null ? unit : null,
      quality: showHarvest ? quality : null,
      tags,
    };
    return entry ? api.put(`/journal/${entry.id}`, payload) : api.post('/journal', payload);
  }, [qk.journal]);
  const remove = useApiMutation(() => api.delete(`/journal/${entry!.id}`), [qk.journal]);

  return (
    <Sheet
      title={entry ? 'Naplóbejegyzés' : 'Új bejegyzés'}
      open
      onClose={onClose}
      onConfirm={() => save.mutate(undefined, { onSuccess: onClose })}
      confirmLabel={entry ? 'Kész' : 'Hozzáadás'}
      confirmDisabled={!date || (!body.trim() && amount == null)}
      busy={save.isPending || remove.isPending}
      error={errorMessage(save.error ?? remove.error)}
    >
      <div className={s.types} role="radiogroup" aria-label="Típus">
        {JOURNAL_TYPES.map((t) => {
          const Icon = JOURNAL_TYPE_ICON[t];
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              className={`${s.typeOption} ${type === t ? s.typeSelected : ''}`}
              style={{ '--c': JOURNAL_TYPE_COLOR[t] } as CSSProperties}
              onClick={() => setType(t)}
            >
              <Icon size={18} strokeWidth={2.2} />
              {JOURNAL_TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>

      <FormGroup>
        <FormRow label="Szöveg" stacked hideLabel>
          <TextArea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={JOURNAL_PLACEHOLDER[type]} />
        </FormRow>
        <FormRow label="Dátum">
          <DateInput value={date} onChange={setDate} max={todayISO()} required />
        </FormRow>
      </FormGroup>

      {showHarvest && (
        <FormGroup title="Termés">
          <FormRow label="Mennyiség">
            <span className={s.amountRow}>
              <NumberInput value={amount} onChange={setAmount} min={0} step="any" inputMode="decimal" aria-label="Mennyiség" />
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Egység">
                {[...new Set([...UNITS, unit])].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </span>
          </FormRow>
          <FormRow label="Minőség">
            <StarRating value={quality} onChange={setQuality} label="Minőség" />
          </FormRow>
        </FormGroup>
      )}

      <FormGroup
        title="Kapcsolódik"
        footer={plantingId ? 'A növény, a fajta és az ágyás az ültetésből adódik.' : 'Ültetés nélkül növényhez, fajtához vagy ágyáshoz is köthető.'}
      >
        <FormRow label="Ültetés">
          <Select value={plantingId ?? ''} onChange={(e) => setPlantingId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Nincs</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {plantingTitle(p)}
                {p.bed_name ? ` · ${p.bed_name}` : ''}
                {p.year !== year ? ` (${p.year})` : ''}
              </option>
            ))}
          </Select>
        </FormRow>
        {!plantingId && (
          <>
            <FormRow label="Növény">
              <Select
                value={plantId ?? ''}
                onChange={(e) => {
                  setPlantId(e.target.value ? Number(e.target.value) : null);
                  setVarietyId(null);
                }}
              >
                <option value="">Nincs</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name_hu}
                  </option>
                ))}
              </Select>
            </FormRow>
            {plantId && varieties.length > 0 && (
              <FormRow label="Fajta">
                <Select value={varietyId ?? ''} onChange={(e) => setVarietyId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Nincs megadva</option>
                  {varieties.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </FormRow>
            )}
            <FormRow label="Ágyás">
              <Select value={bedId ?? ''} onChange={(e) => setBedId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Nincs</option>
                {beds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormRow>
          </>
        )}
      </FormGroup>

      <FormGroup footer="Vesszővel elválasztva, pl. lisztharmat, korai fagy">
        <FormRow label="Címkék">
          <TextInput value={tags} onChange={(e) => setTags(e.target.value)} placeholder="címkék" />
        </FormRow>
      </FormGroup>

      {entry && (
        <FormGroup>
          {confirmDelete ? (
            <FormButton destructive onClick={() => remove.mutate(undefined, { onSuccess: onClose })}>
              Biztosan törlöd?
            </FormButton>
          ) : (
            <FormButton destructive onClick={() => setConfirmDelete(true)}>
              Bejegyzés törlése
            </FormButton>
          )}
        </FormGroup>
      )}
    </Sheet>
  );
}
