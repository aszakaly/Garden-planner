import { DATE_FIELDS, usesSow, usesTransplant, type DateField, type PlantingDates } from '@shared/domain/dates.ts';
import { harvestTotals } from '@shared/domain/journal.ts';
import { shortDate } from '@shared/domain/isoDate.ts';
import { statusFromActuals } from '@shared/domain/tasks.ts';
import {
  EVAL_RECOMMEND,
  EVAL_RECOMMEND_LABEL,
  PLANTING_STATUS_LABEL,
  PLANTING_STATUSES,
  type EvalRecommend,
  type PlantingStatus,
} from '@shared/labels.ts';
import type { PlantingActualInput } from '@shared/schemas.ts';
import type { BedListItem, PlantingListItem } from '@shared/types.ts';
import { DateInput, FormGroup, FormRow, NumberInput, Select, TextArea, TextInput, Toggle } from '../../components/ui/Form.tsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx';
import { StarRating } from '../../components/ui/StarRating.tsx';
import { todayISO } from '../../lib/format.ts';
import { useJournal } from '../../lib/queries.ts';
import { formatAmount } from '../journal/journalView.ts';
import s from './PlantingEditSheet.module.css';

export interface ActualForm {
  status: PlantingStatus;
  dates: PlantingDates;
  elsewhere: boolean;
  bed_id: number | null;
  axis_start_cm: number | null;
  axis_span_cm: number | null;
  eval_success: number | null;
  eval_yield: string;
  eval_recommend: EvalRecommend | null;
  eval_notes: string;
}

export function actualFromPlanting(p: PlantingListItem): ActualForm {
  const elsewhere = p.actual_bed_id != null || p.actual_axis_start_cm != null;
  return {
    status: p.status,
    dates: { sow: p.actual_sow_date, transplant: p.actual_transplant_date, harvestStart: p.actual_harvest_start, end: p.actual_end_date },
    elsewhere,
    bed_id: elsewhere ? (p.actual_bed_id ?? p.bed_id) : null,
    axis_start_cm: elsewhere ? (p.actual_axis_start_cm ?? p.axis_start_cm) : null,
    axis_span_cm: elsewhere ? (p.actual_axis_span_cm ?? p.axis_span_cm) : null,
    eval_success: p.eval_success,
    eval_yield: p.eval_yield ?? '',
    eval_recommend: p.eval_recommend,
    eval_notes: p.eval_notes ?? '',
  };
}

export function actualPayload(f: ActualForm): PlantingActualInput {
  return {
    status: f.status,
    actual_sow_date: f.dates.sow,
    actual_transplant_date: f.dates.transplant,
    actual_harvest_start: f.dates.harvestStart,
    actual_end_date: f.dates.end,
    actual_bed_id: f.elsewhere ? f.bed_id : null,
    actual_axis_start_cm: f.elsewhere && f.axis_span_cm ? f.axis_start_cm : null,
    actual_axis_span_cm: f.elsewhere && f.axis_span_cm ? f.axis_span_cm : null,
    actual_cross_start_cm: null,
    actual_cross_span_cm: null,
    eval_success: f.eval_success,
    eval_yield: f.eval_yield,
    eval_recommend: f.eval_recommend,
    eval_notes: f.eval_notes,
  };
}

const FIELD_LABEL: Record<DateField, string> = {
  sow: 'Vetés',
  transplant: 'Kiültetés',
  harvestStart: 'Betakarítás kezdete',
  end: 'Terület felszabadult',
};

const STATUS_HINT: Record<PlantingStatus, string> = {
  terv: 'Még nem kezdődött el. A tény dátumok kitöltésekor magától „Folyamatban” lesz.',
  folyamatban: 'Elkezdődött, a terület foglalt. A felszabadulás napjával lezárul.',
  lezart: 'Lezárult – a vetésforgó ezt tényként veszi figyelembe.',
  elmaradt: 'Nem valósult meg: nem foglal helyet, és a vetésforgóban sem számít.',
  sikertelen: 'Elkezdődött, de nem sikerült (pl. kifagyott, elpusztult). A vetésforgóban számít.',
};

interface Props {
  planting: PlantingListItem;
  value: ActualForm;
  onChange: (value: ActualForm) => void;
  beds: BedListItem[];
}

/** Az ültetés tényleges megvalósulása: státusz, tény dátumok, eltérő hely, szezonvégi értékelés. */
export function PlantingActualPanel({ planting: p, value: f, onChange, beds }: Props) {
  const { data: entries = [] } = useJournal({ planting_id: p.id });
  const totals = harvestTotals(entries);
  const set = <K extends keyof ActualForm>(key: K, v: ActualForm[K]) => onChange({ ...f, [key]: v });
  const plan: PlantingDates = { sow: p.plan_sow_date, transplant: p.plan_transplant_date, harvestStart: p.plan_harvest_start, end: p.plan_end_date };
  const fields = DATE_FIELDS.filter(
    (field) =>
      (field !== 'sow' || usesSow(p.method)) && (field !== 'transplant' || usesTransplant(p.method)),
  );

  const labelOf = (field: DateField) =>
    field === 'sow' && p.method === 'ultetes' ? 'Ültetés' : field === 'sow' && p.method === 'palanta' ? 'Vetés (palántának)' : FIELD_LABEL[field];

  // A tény dátumokból adódik a státusz (a kézi „elmaradt / sikertelen” megmarad)
  function setDate(field: DateField, v: string | null) {
    const dates = { ...f.dates, [field]: v };
    onChange({ ...f, dates, status: statusFromActuals(f.status, dates) });
  }

  return (
    <>
      <FormGroup title="Állapot" footer={STATUS_HINT[f.status]}>
        <FormRow label="Státusz">
          <Select value={f.status} onChange={(e) => set('status', e.target.value as PlantingStatus)}>
            {PLANTING_STATUSES.map((st) => (
              <option key={st} value={st}>
                {PLANTING_STATUS_LABEL[st]}
              </option>
            ))}
          </Select>
        </FormRow>
      </FormGroup>

      <FormGroup title="Tényleges dátumok" footer="Üresen hagyva: még nem történt meg. Mellette a terv szerinti nap látszik.">
        {fields.map((field) => (
          <FormRow key={field} label={labelOf(field)}>
            <span className={s.actualDate}>
              {plan[field] && <span className={s.planHint}>terv: {shortDate(plan[field]!)}</span>}
              <DateInput value={f.dates[field]} onChange={(v) => setDate(field, v)} max={todayISO()} aria-label={`${labelOf(field)} (tény)`} />
            </span>
          </FormRow>
        ))}
      </FormGroup>

      <FormGroup
        title="Hely"
        footer={f.elsewhere ? 'A sáv az ágyás elejétől mérve; üresen hagyva az egész ágyás.' : `Terv szerint: ${p.bed_name ?? 'nincs ágyás'}.`}
      >
        <FormRow label="Eltérő helyen valósult meg">
          <Toggle
            checked={f.elsewhere}
            label="Eltérő helyen valósult meg"
            onChange={(v) =>
              onChange({
                ...f,
                elsewhere: v,
                bed_id: v ? (f.bed_id ?? p.bed_id) : null,
                axis_start_cm: v ? (f.axis_start_cm ?? p.axis_start_cm) : null,
                axis_span_cm: v ? (f.axis_span_cm ?? p.axis_span_cm) : null,
              })
            }
          />
        </FormRow>
        {f.elsewhere && (
          <>
            <FormRow label="Ágyás">
              <Select value={f.bed_id ?? ''} onChange={(e) => set('bed_id', e.target.value ? Number(e.target.value) : null)}>
                <option value="">Nincs</option>
                {beds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="Kezdete">
              <NumberInput value={f.axis_start_cm} min={0} unit="cm" onChange={(v) => set('axis_start_cm', v)} />
            </FormRow>
            <FormRow label="Sáv szélessége">
              <NumberInput value={f.axis_span_cm} min={1} unit="cm" onChange={(v) => set('axis_span_cm', v)} />
            </FormRow>
          </>
        )}
      </FormGroup>

      <FormGroup
        title="Szezonvégi értékelés"
        footer={totals.length ? `A naplóban rögzített termés: ${totals.map((t) => formatAmount(t.amount, t.unit)).join(' · ')}` : undefined}
      >
        <FormRow label="Siker">
          <StarRating value={f.eval_success} onChange={(v) => set('eval_success', v)} label="Siker" />
        </FormRow>
        <FormRow label="Termés">
          <TextInput value={f.eval_yield} onChange={(e) => set('eval_yield', e.target.value)} placeholder="pl. kb. 15 kg, bőséges" maxLength={200} />
        </FormRow>
        <FormRow label="Újra termesztem">
          <SegmentedControl<EvalRecommend | ''>
            size="small"
            label="Újra termesztem"
            value={f.eval_recommend ?? ''}
            options={[{ value: '', label: '—' }, ...EVAL_RECOMMEND.map((r) => ({ value: r, label: EVAL_RECOMMEND_LABEL[r] }))]}
            onChange={(v) => set('eval_recommend', v || null)}
          />
        </FormRow>
        <FormRow label="Tapasztalatok" stacked>
          <TextArea rows={3} value={f.eval_notes} onChange={(e) => set('eval_notes', e.target.value)} placeholder="Mi vált be, mit csinálnál másképp?" />
        </FormRow>
      </FormGroup>
    </>
  );
}
