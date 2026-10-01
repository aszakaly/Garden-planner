import { CheckCircle2, ChevronRight, Pencil, Snowflake, Sprout } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  DATA_STATUS_LABEL,
  NUTRIENT_LABEL,
  ROTATION_STAGE_LABEL,
  SUN_LABEL,
} from '@shared/labels.ts';
import type { CompanionView, GrowingWindow, PlantingListItem, Variety } from '@shared/types.ts';
import { Chip } from '../../components/ui/Chip.tsx';
import { AddButton, Block, Fact, FactGrid } from '../../components/ui/Detail.tsx';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { api } from '../../lib/api.ts';
import { withArticle } from '../../lib/format.ts';
import { qk, useApiMutation, useBeds, useCultivation, useJournal, usePlantDetail, usePlantings, useSettings } from '../../lib/queries.ts';
import { useYear } from '../../lib/year.tsx';
import { PlantingEditSheet } from '../plan/PlantingEditSheet.tsx';
import { PlantingRow } from '../plan/PlantingRow.tsx';
import { byStart, effectiveBedId } from '../plan/plantingView.ts';
import { useYearChecks } from '../plan/useChecks.ts';
import { JournalPreview } from '../journal/JournalPreview.tsx';
import { journalDate } from '../journal/journalView.ts';
import { useJournalSheet } from '../journal/useJournalSheet.tsx';
import { CompanionEditSheet } from './CompanionEditSheet.tsx';
import { CultivationList } from './CultivationList.tsx';
import { PlantEditSheet } from './PlantEditSheet.tsx';
import { SeasonCalendar } from './SeasonCalendar.tsx';
import { VarietyEditSheet } from './VarietyEditSheet.tsx';
import { WindowEditSheet } from './WindowEditSheet.tsx';
import s from './PlantDetailPage.module.css';

type Editing =
  | { kind: 'plant' }
  | { kind: 'window'; window?: GrowingWindow; varietyId?: number }
  | { kind: 'variety'; variety?: Variety }
  | { kind: 'companion'; companion?: CompanionView }
  | null;

export function PlantDetailPage() {
  const id = Number(useParams().id);
  const { data, isLoading, error } = usePlantDetail(id);
  const { data: settings } = useSettings();
  const [editing, setEditing] = useState<Editing>(null);
  const [showNeutral, setShowNeutral] = useState(false);
  const { year } = useYear();
  const { data: plantings = [] } = usePlantings(year);
  const { data: beds = [] } = useBeds(year);
  const [plantingEdit, setPlantingEdit] = useState<PlantingListItem | 'new' | null>(null);
  const checks = useYearChecks(year);
  const [plantingTab, setPlantingTab] = useState<'terv' | 'teny'>('terv');
  const { data: history = [] } = useCultivation({ plantId: id });
  const { data: entries = [] } = useJournal({ plant_id: id }, id > 0);
  const journal = useJournalSheet();
  const verify = useApiMutation(() => api.patch(`/plants/${id}`, { data_status: 'ellenorzott' }), [qk.plant(id), qk.plants]);

  if (isLoading) return <PageHeader title="Növény" color="var(--c-mint)" />;
  if (error || !data) {
    return (
      <>
        <PageHeader title="Nem található" color="var(--c-mint)" />
        <p className={s.muted}>
          Ez a növény nem létezik. <Link to="/novenyek">Vissza a növényekhez</Link>
        </p>
      </>
    );
  }

  const { plant, family, crop_group, windows, varieties, companions } = data;
  const good = companions.filter((c) => c.relation === 1);
  const bad = companions.filter((c) => c.relation === -1);
  const neutral = companions.filter((c) => c.relation === 0);
  const close = () => setEditing(null);

  return (
    <div className={s.page}>
      <PageHeader
        title={plant.name_hu}
        color="var(--c-mint)"
        back={{ to: '/novenyek', label: 'Növények' }}
        actions={
          <ToolbarButton label="Szerkesztés" onClick={() => setEditing({ kind: 'plant' })}>
            <Pencil size={17} strokeWidth={2.2} />
          </ToolbarButton>
        }
        subtitle={
          <span className={s.subtitle}>
            {plant.name_latin && <em>{plant.name_latin}</em>}
            {plant.perennial && <Chip>Évelő</Chip>}
            {plant.frost_sensitive && (
              <Chip tone="info">
                <Snowflake size={11} strokeWidth={2.6} /> Fagyérzékeny
              </Chip>
            )}
          </span>
        }
      />

      {plant.data_status === 'alapertek' && (
        <div className={s.banner}>
          <div>
            <strong>{DATA_STATUS_LABEL.alapertek}</strong>
            <p>Az időpontok és méretek általános magyar vetési naptárakból származnak. Nézd át, és igazítsd a saját kertedhez.</p>
          </div>
          <button type="button" className={s.bannerButton} onClick={() => verify.mutate(undefined)}>
            <CheckCircle2 size={16} /> Ellenőriztem
          </button>
        </div>
      )}

      <FactGrid>
        <Fact label="Család" value={family?.name_hu} detail={family ? `${family.rotation_gap_years} év vetésforgó-szünet` : undefined} />
        <Fact label="Zöldségcsoport" value={crop_group?.name_hu} />
        <Fact label="Vetésforgó-szakasz" value={plant.rotation_stage ? ROTATION_STAGE_LABEL[plant.rotation_stage] : 'Vetésforgón kívül'} />
        <Fact label="Tápanyagigény" value={plant.nutrient_group ? NUTRIENT_LABEL[plant.nutrient_group] : undefined} />
        <Fact
          label="Tőtáv × sortáv"
          value={plant.in_row_spacing_cm && plant.row_spacing_cm ? `${plant.in_row_spacing_cm} × ${plant.row_spacing_cm} cm` : undefined}
        />
        <Fact
          label="Betakarításig"
          value={plant.days_to_harvest ? `${plant.days_to_harvest} nap` : undefined}
          detail={plant.harvest_duration_days ? `kb. ${plant.harvest_duration_days} napig szedhető` : undefined}
        />
        <Fact label="Fényigény" value={plant.sun ? SUN_LABEL[plant.sun] : undefined} />
        <Fact label="Csírázóképesség" value={plant.seed_viability_years ? `${plant.seed_viability_years} év` : undefined} />
      </FactGrid>

      <Block
        title="Termesztési naptár"
        action={<AddButton onClick={() => setEditing({ kind: 'window' })}>Új időszak</AddButton>}
      >
        {windows.length ? (
          <SeasonCalendar
            windows={windows}
            lastFrost={settings?.lastFrost}
            firstFrost={settings?.firstFrost}
            onSelect={(w) => setEditing({ kind: 'window', window: w })}
          />
        ) : (
          <p className={s.muted}>Még nincs megadva termesztési időszak.</p>
        )}
        {windows.some((w) => w.notes) && (
          <ul className={s.windowNotes}>
            {windows
              .filter((w) => w.notes)
              .map((w) => (
                <li key={w.id}>{w.notes}</li>
              ))}
          </ul>
        )}
      </Block>

      <Block
        title="Társítások"
        action={<AddButton onClick={() => setEditing({ kind: 'companion' })}>Társítás</AddButton>}
      >
        <div className={s.companions}>
          <CompanionList title="Kedvező szomszédok" tone="good" items={good} onEdit={(c) => setEditing({ kind: 'companion', companion: c })} />
          <CompanionList title="Kerülendő szomszédok" tone="bad" items={bad} onEdit={(c) => setEditing({ kind: 'companion', companion: c })} />
        </div>
        {neutral.length > 0 && (
          <div className={s.neutral}>
            <button type="button" className={s.linkButton} onClick={() => setShowNeutral((v) => !v)}>
              {showNeutral ? 'Semlegesek elrejtése' : `Semleges vagy ellentmondó (${neutral.length})`}
            </button>
            {showNeutral && (
              <CompanionList tone="neutral" items={neutral} onEdit={(c) => setEditing({ kind: 'companion', companion: c })} />
            )}
          </div>
        )}
      </Block>

      <Block title="Fajták" action={<AddButton onClick={() => setEditing({ kind: 'variety' })}>Új fajta</AddButton>}>
        {varieties.length ? (
          <div className={s.list}>
            {varieties.map((v) => (
              <Link key={v.id} to={`/novenyek/${plant.id}/fajtak/${v.id}`} className={s.varietyRow}>
                <Sprout size={16} className={s.varietyIcon} />
                <span className={s.varietyText}>
                  <span className={s.varietyName}>{v.name}</span>
                  {v.description && <span className={s.varietyDesc}>{v.description}</span>}
                </span>
                {v.days_to_harvest && <span className={s.varietyMeta}>{v.days_to_harvest} nap</span>}
                {v.stock_count > 0 && (
                  <Chip tone="good">
                    Vetőmag készleten{v.latest_vintage ? ` · ${v.latest_vintage}` : ''}
                  </Chip>
                )}
                <ChevronRight size={16} className={s.varietyChevron} />
              </Link>
            ))}
          </div>
        ) : (
          <p className={s.muted}>Még nincs rögzített fajta. Vetőmag felvételekor is létrehozhatsz fajtát.</p>
        )}
      </Block>

      <Block title={`Ültetések ${year}`} action={<AddButton onClick={() => setPlantingEdit('new')}>Tervbe veszem</AddButton>}>
        {plantings.some((p) => p.plant_id === plant.id) ? (
          <div className={s.plantings}>
            {plantings
              .filter((p) => p.plant_id === plant.id)
              .sort(byStart)
              .map((p) => (
                <PlantingRow
                  key={p.id}
                  planting={p}
                  year={year}
                  bed={beds.find((b) => b.id === effectiveBedId(p))}
                  showBed
                  issues={checks.byPlanting.get(p.id)}
                  onOpen={() => setPlantingEdit(p)}
                />
              ))}
          </div>
        ) : (
          <p className={s.muted}>Ebben az évben még nincs {plant.name_hu.toLowerCase()} a tervben.</p>
        )}
      </Block>

      {plant.notes && (
        <Block title="Megjegyzés">
          <p className={s.notes}>{plant.notes}</p>
        </Block>
      )}

      <Block title="Termesztési előzmények">
        <CultivationList
          plantings={history}
          entries={entries}
          onOpen={(p) => {
            setPlantingTab('teny');
            setPlantingEdit(p);
          }}
          empty="Még nincs rögzített termesztés. Az ültetések megvalósulása és szezonvégi értékelése itt gyűlik évről évre."
        />
      </Block>

      <Block
        title="Napló"
        action={<AddButton onClick={() => journal.create({ plant_id: plant.id, entry_date: journalDate(year) })}>Új bejegyzés</AddButton>}
      >
        <JournalPreview
          entries={entries}
          onOpen={journal.open}
          showYear
          moreLink={`/naplo?noveny=${plant.id}&ev=mind`}
          empty={`Még nincs naplóbejegyzés ${withArticle(plant.name_hu.toLocaleLowerCase('hu'))} kapcsán.`}
        />
      </Block>
      {journal.sheet}

      {plant.source && <p className={s.source}>{plant.source}</p>}

      <PlantEditSheet open={editing?.kind === 'plant'} onClose={close} plant={plant} />
      <PlantingEditSheet
        open={plantingEdit !== null}
        onClose={() => {
          setPlantingEdit(null);
          setPlantingTab('terv');
        }}
        planting={plantingEdit && plantingEdit !== 'new' ? plantingEdit : undefined}
        plantId={plant.id}
        year={plantingEdit && plantingEdit !== 'new' ? plantingEdit.year : year}
        initialTab={plantingTab}
      />
      <WindowEditSheet
        open={editing?.kind === 'window'}
        onClose={close}
        plantId={plant.id}
        window={editing?.kind === 'window' ? editing.window : undefined}
      />
      <VarietyEditSheet
        open={editing?.kind === 'variety'}
        onClose={close}
        plantId={plant.id}
        plantName={plant.name_hu}
        variety={editing?.kind === 'variety' ? editing.variety : undefined}
      />
      <CompanionEditSheet
        open={editing?.kind === 'companion'}
        onClose={close}
        plantId={plant.id}
        plantName={plant.name_hu}
        companion={editing?.kind === 'companion' ? editing.companion : undefined}
      />
    </div>
  );
}

function CompanionList({
  title,
  tone,
  items,
  onEdit,
}: {
  title?: string;
  tone: 'good' | 'bad' | 'neutral';
  items: CompanionView[];
  onEdit: (c: CompanionView) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Saját bejegyzések elöl, utána a több forrásadattal alátámasztottak
  const strength = (c: CompanionView) =>
    (c.source === 'user' ? 1e6 : 0) + (c.evidence?.kedvezo ?? 0) + (c.evidence?.kerulendo ?? 0);
  const sorted = [...items].sort((a, b) => strength(b) - strength(a));
  const visible = expanded ? sorted : sorted.slice(0, COMPANION_PREVIEW);
  return (
    <div className={`${s.companionList} ${s[tone]}`}>
      {title && (
        <h3>
          <span className={s.dot} />
          {title} <span className={s.count}>{items.length}</span>
        </h3>
      )}
      {items.length === 0 && <p className={s.muted}>Nincs adat.</p>}
      {visible.map((c) => (
        <div key={c.id} className={s.companionRow}>
          <div className={s.companionText}>
            <Link to={`/novenyek/${c.other_plant_id}`} className={s.companionName}>
              {c.other_plant_name}
            </Link>
            {c.source === 'user' && <Chip tone="info">saját</Chip>}
            {c.reason && <span className={s.companionReason}>{c.reason}</span>}
          </div>
          <button type="button" className={s.editButton} onClick={() => onEdit(c)} aria-label={`${c.other_plant_name} szerkesztése`}>
            <Pencil size={13} />
          </button>
        </div>
      ))}
      {items.length > COMPANION_PREVIEW && (
        <button type="button" className={s.linkButton} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Kevesebb' : `Mind (${items.length})`}
        </button>
      )}
    </div>
  );
}

const COMPANION_PREVIEW = 8;
