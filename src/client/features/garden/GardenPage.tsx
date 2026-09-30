import { Pencil, Plus } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { BED_TYPE_LABEL, SUN_LABEL } from '@shared/labels.ts';
import type { BedListItem, Garden } from '@shared/types.ts';
import { FormGroup, FormRow, TextArea, TextInput } from '../../components/ui/Form.tsx';
import { IconCircle } from '../../components/ui/IconCircle.tsx';
import { LinkRow } from '../../components/ui/LinkRow.tsx';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { Sheet } from '../../components/ui/Sheet.tsx';
import { api } from '../../lib/api.ts';
import { areaM2, BED_ICON, formatArea, formatDimensions } from '../../lib/beds.ts';
import { colorVar } from '../../lib/colors.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation, useBeds, useGardens } from '../../lib/queries.ts';
import { useYear } from '../../lib/year.tsx';
import { BedEditSheet } from './BedEditSheet.tsx';
import s from './GardenPage.module.css';

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 });

export function GardenPage() {
  const { year } = useYear();
  const { data: beds = [], isLoading } = useBeds(year);
  const { data: gardens = [] } = useGardens();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editingGarden, setEditingGarden] = useState(false);
  const garden = gardens[0];

  // Az oldalsáv „Új ágyás” linkje (?uj=1) rögtön megnyitja a lapot
  useEffect(() => {
    if (params.get('uj') === '1') {
      setCreating(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const active = beds.filter((b) => b.active);
  const inactive = beds.filter((b) => !b.active);
  const total = active.reduce((sum, b) => sum + areaM2(b.length_cm, b.width_cm), 0);
  const covered = active
    .filter((b) => b.bed_type === 'folia' || b.bed_type === 'uveghaz')
    .reduce((sum, b) => sum + areaM2(b.length_cm, b.width_cm), 0);

  return (
    <div className={s.page}>
      <PageHeader
        title="Kert és ágyások"
        color="var(--c-teal)"
        count={active.length || undefined}
        actions={
          <ToolbarButton label="Új ágyás" onClick={() => setCreating(true)}>
            <Plus size={19} strokeWidth={2.2} />
          </ToolbarButton>
        }
      />

      {garden && (
        <button type="button" className={s.garden} onClick={() => setEditingGarden(true)}>
          <span>
            <strong>{garden.name}</strong>
            {garden.location && <span className={s.location}>{garden.location}</span>}
          </span>
          <Pencil size={15} className={s.gardenEdit} />
        </button>
      )}

      <div className={s.stats}>
        <Stat value={String(active.length)} label={`használt ágyás (${year})`} />
        <Stat value={`${nf.format(total)} m²`} label="termőterület" />
        <Stat value={`${nf.format(covered)} m²`} label="fólia / üvegház" />
      </div>

      {!isLoading && beds.length === 0 && (
        <div className={s.empty}>
          <p className={s.emptyTitle}>Még nincs ágyás</p>
          <p>Vedd fel a kert ágyásait a méretükkel – erre épül a tervezés és a vetésforgó.</p>
          <button type="button" className={s.emptyButton} onClick={() => setCreating(true)}>
            <Plus size={16} strokeWidth={2.4} /> Első ágyás felvétele
          </button>
        </div>
      )}

      {active.length > 0 && (
        <Section title="Használatban">
          {active.map((b) => (
            <BedRow key={b.id} bed={b} />
          ))}
        </Section>
      )}
      {inactive.length > 0 && (
        <Section title="Nincs használatban" detail={`a ${year}. évben`}>
          {inactive.map((b) => (
            <BedRow key={b.id} bed={b} />
          ))}
        </Section>
      )}

      <BedEditSheet open={creating} onClose={() => setCreating(false)} />
      {garden && <GardenEditSheet open={editingGarden} onClose={() => setEditingGarden(false)} garden={garden} />}
    </div>
  );
}

function BedRow({ bed }: { bed: BedListItem }) {
  const years =
    bed.active_to_year || (bed.active_from_year && bed.active_from_year > new Date().getFullYear())
      ? `${bed.active_from_year ?? '…'}–${bed.active_to_year ?? ''}`
      : null;
  return (
    <LinkRow
      to={`/agyas/${bed.id}`}
      leading={<IconCircle icon={BED_ICON[bed.bed_type]} color={colorVar(bed.color)} size={30} />}
      title={bed.name}
      subtitle={[
        formatDimensions(bed.length_cm, bed.width_cm),
        formatArea(bed.length_cm, bed.width_cm),
        BED_TYPE_LABEL[bed.bed_type],
        bed.sun ? SUN_LABEL[bed.sun] : null,
        years,
      ]
        .filter(Boolean)
        .join(' · ')}
      accessory={<BedThumb bed={bed} />}
    />
  );
}

/** Arányos kis téglalap az ágyás alakjáról. */
function BedThumb({ bed }: { bed: BedListItem }) {
  const max = 44;
  const ratio = bed.length_cm / bed.width_cm;
  const w = ratio >= 1 ? max : Math.max(8, max * ratio);
  const h = ratio >= 1 ? Math.max(6, max / ratio) : max;
  return (
    <span className={s.thumbBox} aria-hidden>
      <span className={s.thumb} style={{ width: w, height: h, '--c': colorVar(bed.color) } as CSSProperties} />
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className={s.stat}>
      <span className={s.statValue}>{value}</span>
      <span className={s.statLabel}>{label}</span>
    </div>
  );
}

function GardenEditSheet({ open, onClose, garden }: { open: boolean; onClose: () => void; garden: Garden }) {
  const [form, setForm] = useState({ name: '', location: '', notes: '' });
  useEffect(() => {
    if (open) setForm({ name: garden.name, location: garden.location ?? '', notes: garden.notes ?? '' });
  }, [open, garden.id]);
  const save = useApiMutation(() => api.put(`/gardens/${garden.id}`, form), [qk.gardens]);
  return (
    <Sheet
      title="Kert adatai"
      open={open}
      onClose={onClose}
      onConfirm={() => save.mutate(undefined, { onSuccess: onClose })}
      confirmDisabled={!form.name.trim()}
      busy={save.isPending}
      error={errorMessage(save.error)}
    >
      <FormGroup>
        <FormRow label="Név">
          <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </FormRow>
        <FormRow label="Helyszín">
          <TextInput value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        </FormRow>
      </FormGroup>
      <FormGroup title="Megjegyzés">
        <FormRow label="Megjegyzés" stacked hideLabel>
          <TextArea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </FormRow>
      </FormGroup>
    </Sheet>
  );
}
