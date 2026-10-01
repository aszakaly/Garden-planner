import { ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ROTATION_STAGE_LABEL } from '@shared/labels.ts';
import type { Settings } from '@shared/settings.ts';
import type { CropGroup, PlantFamily } from '@shared/types.ts';
import { FormGroup, FormRow, MonthDayInput, TextInput } from '../../components/ui/Form.tsx';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { api } from '../../lib/api.ts';
import { errorMessage } from '../../lib/errors.ts';
import { qk, useApiMutation, useCropGroups, useFamilies, useSettings } from '../../lib/queries.ts';
import { DataGroup } from './DataGroup.tsx';
import { CropGroupEditSheet, FamilyEditSheet } from './MasterEditSheets.tsx';
import s from './SettingsPage.module.css';

type Editing = { kind: 'family'; item?: PlantFamily } | { kind: 'group'; item?: CropGroup } | null;

export function SettingsPage() {
  const { data: settings } = useSettings();
  const { data: families = [] } = useFamilies();
  const { data: groups = [] } = useCropGroups();
  const [editing, setEditing] = useState<Editing>(null);
  const [region, setRegion] = useState('');
  const save = useApiMutation((patch: Partial<Settings>) => api.put<Settings>('/settings', patch), [qk.settings]);

  useEffect(() => {
    if (settings) setRegion(settings.region);
  }, [settings]);

  return (
    <div className={s.page}>
      <PageHeader title="Beállítások" grouped />
      {save.error && <p className={s.error}>{errorMessage(save.error)}</p>}

      <FormGroup
        title="Kert és éghajlat"
        footer="A fagyhatárok a naptárakon jelennek meg, és ezekhez méri a rendszer a fagyérzékeny növények kiültetését."
      >
        <FormRow label="Régió">
          <TextInput
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            onBlur={() => region !== settings?.region && save.mutate({ region })}
          />
        </FormRow>
        <FormRow label="Utolsó tavaszi fagy">
          <MonthDayInput
            allowEmpty={false}
            value={settings?.lastFrost}
            onChange={(v) => v && save.mutate({ lastFrost: v })}
          />
        </FormRow>
        <FormRow label="Első őszi fagy">
          <MonthDayInput
            allowEmpty={false}
            value={settings?.firstFrost}
            onChange={(v) => v && save.mutate({ firstFrost: v })}
          />
        </FormRow>
      </FormGroup>

      <FormGroup title="Növénycsaládok" footer="A vetésforgó-szünet: hány évig ne kerüljön ugyanabból a családból növény ugyanarra a helyre.">
        {families.map((f) => (
          <ListButton
            key={f.id}
            onClick={() => setEditing({ kind: 'family', item: f })}
            title={f.name_hu}
            detail={`${f.rotation_gap_years} év · ${f.plant_count ?? 0} növény`}
          />
        ))}
        <ListButton onClick={() => setEditing({ kind: 'family' })} title="Új család" add />
      </FormGroup>

      <FormGroup
        title="Zöldségcsoportok (fogyasztott rész szerint)"
        footer="A vetésforgó-szakasz a négyes forgó egy lépése: hüvelyes → levél → termés → gyökér."
      >
        {groups.map((g) => (
          <ListButton
            key={g.id}
            onClick={() => setEditing({ kind: 'group', item: g })}
            title={g.name_hu}
            detail={`${g.rotation_stage ? ROTATION_STAGE_LABEL[g.rotation_stage] : 'forgón kívül'} · ${g.plant_count ?? 0} növény`}
          />
        ))}
        <ListButton onClick={() => setEditing({ kind: 'group' })} title="Új zöldségcsoport" add />
      </FormGroup>

      <DataGroup />

      <FormGroup title="Források">
        <div className={s.sources}>
          <Source title="Növénytársítások">
            <a href="https://plants.windrivergreens.com" target="_blank" rel="noreferrer">
              Wind River Greens – Plant Variety Database
            </a>{' '}
            (
            <a href="https://github.com/bripatch/plant-variety-database" target="_blank" rel="noreferrer">
              GitHub
            </a>
            ), licenc:{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/deed.hu" target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
            . A fajtaszintű angol adatokat fajokra összevonva, magyar indoklással vettük át; a saját bejegyzéseid felülírják
            őket.
          </Source>
          <Source title="Vetési és betakarítási időszakok">
            Általános magyar vetési naptárak alapján összeállított alapértékek (
            <a href="https://kertvar.hu/zoldseg-vetesi-naptar/" target="_blank" rel="noreferrer">
              kertvar.hu
            </a>
            ,{' '}
            <a
              href="https://www.agroinform.hu/hazikert/vetes-ideje-mikor-melyik-zoldseget-erdemes-elvetni-91134-001"
              target="_blank"
              rel="noreferrer"
            >
              agroinform.hu
            </a>
            ,{' '}
            <a href="https://kertlap.hu/kerti-teendok/vetesterv/" target="_blank" rel="noreferrer">
              kertlap.hu
            </a>
            ). Tájékoztató jellegűek – a növény adatlapján „Ellenőriztem” jelöléssel véglegesítheted őket.
          </Source>
        </div>
      </FormGroup>

      <FamilyEditSheet
        open={editing?.kind === 'family'}
        item={editing?.kind === 'family' ? editing.item : undefined}
        onClose={() => setEditing(null)}
      />
      <CropGroupEditSheet
        open={editing?.kind === 'group'}
        item={editing?.kind === 'group' ? editing.item : undefined}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function ListButton({ title, detail, onClick, add }: { title: string; detail?: string; onClick: () => void; add?: boolean }) {
  return (
    <button type="button" className={`${s.listButton} ${add ? s.add : ''}`} onClick={onClick}>
      {add && <Plus size={16} strokeWidth={2.4} />}
      <span className={s.listTitle}>{title}</span>
      {detail && <span className={s.listDetail}>{detail}</span>}
      {!add && <ChevronRight size={16} className={s.chevron} />}
    </button>
  );
}

function Source({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={s.source}>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
