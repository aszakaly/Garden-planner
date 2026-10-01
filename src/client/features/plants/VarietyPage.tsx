import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { SEED_VIABILITY_LABEL } from '@shared/domain/seeds.ts';
import { harvestTotals } from '@shared/domain/journal.ts';
import { EVAL_RECOMMEND_LABEL, SEED_ORIGIN_LABEL } from '@shared/labels.ts';
import type { PlantingListItem } from '@shared/types.ts';
import { Chip } from '../../components/ui/Chip.tsx';
import { AddButton, Block, Fact, FactGrid } from '../../components/ui/Detail.tsx';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { StarRating } from '../../components/ui/StarRating.tsx';
import { useCultivation, useJournal, usePlantDetail, useSeeds } from '../../lib/queries.ts';
import { useYear } from '../../lib/year.tsx';
import { JournalPreview } from '../journal/JournalPreview.tsx';
import { formatAmount, journalDate } from '../journal/journalView.ts';
import { useJournalSheet } from '../journal/useJournalSheet.tsx';
import { PlantingEditSheet } from '../plan/PlantingEditSheet.tsx';
import { CultivationList } from './CultivationList.tsx';
import { VarietyEditSheet } from './VarietyEditSheet.tsx';
import s from './PlantDetailPage.module.css';

/** Fajtaszintű tudásbázis: adatok, vetőmagkészlet, termesztések évről évre, naplóbejegyzések. */
export function VarietyPage() {
  const plantId = Number(useParams().id);
  const varietyId = Number(useParams().vid);
  const { year } = useYear();
  const { data, isLoading } = usePlantDetail(plantId);
  const { data: seeds = [] } = useSeeds();
  const { data: history = [] } = useCultivation({ varietyId });
  const { data: entries = [] } = useJournal({ variety_id: varietyId }, varietyId > 0);
  const journal = useJournalSheet();
  const [editing, setEditing] = useState(false);
  const [plantingEdit, setPlantingEdit] = useState<PlantingListItem | null>(null);

  const variety = data?.varieties.find((v) => v.id === varietyId);
  if (isLoading) return <PageHeader title="Fajta" color="var(--c-green)" />;
  if (!data || !variety) {
    return (
      <>
        <PageHeader title="Nem található" color="var(--c-green)" back={{ to: `/novenyek/${plantId}`, label: data?.plant.name_hu ?? 'Növény' }} />
        <p className={s.muted} style={{ margin: '0 var(--page-pad)' }}>
          Ez a fajta nem létezik. <Link to={`/novenyek/${plantId}`}>Vissza a növényhez</Link>
        </p>
      </>
    );
  }

  const { plant } = data;
  const stock = seeds.filter((x) => x.variety_id === variety.id);
  const rated = history.filter((p) => p.eval_success);
  const avg = rated.length ? rated.reduce((sum, p) => sum + p.eval_success!, 0) / rated.length : null;
  const lastRecommend = history.find((p) => p.eval_recommend)?.eval_recommend;
  const totals = harvestTotals(entries);
  const years = new Set(history.map((p) => p.year));

  return (
    <div className={s.page}>
      <PageHeader
        title={variety.name}
        color="var(--c-green)"
        back={{ to: `/novenyek/${plant.id}`, label: plant.name_hu }}
        actions={
          <ToolbarButton label="Szerkesztés" onClick={() => setEditing(true)}>
            <Pencil size={17} strokeWidth={2.2} />
          </ToolbarButton>
        }
        subtitle={variety.description ?? undefined}
      />

      <FactGrid>
        <Fact label="Növény" value={<Link to={`/novenyek/${plant.id}`}>{plant.name_hu}</Link>} />
        <Fact
          label="Betakarításig"
          value={(variety.days_to_harvest ?? plant.days_to_harvest) ? `${variety.days_to_harvest ?? plant.days_to_harvest} nap` : undefined}
          detail={variety.days_to_harvest ? 'a fajta saját értéke' : 'a növény általános értéke'}
        />
        <Fact
          label="Tőtáv × sortáv"
          value={
            (variety.in_row_spacing_cm ?? plant.in_row_spacing_cm) && (variety.row_spacing_cm ?? plant.row_spacing_cm)
              ? `${variety.in_row_spacing_cm ?? plant.in_row_spacing_cm} × ${variety.row_spacing_cm ?? plant.row_spacing_cm} cm`
              : undefined
          }
        />
        <Fact label="Termesztve" value={years.size ? `${years.size} évben` : 'még nem'} detail={years.size ? [...years].sort().join(', ') : undefined} />
        <Fact label="Átlagos siker" value={avg ? <StarRating value={Math.round(avg)} label="Átlagos siker" size={14} /> : undefined} detail={avg ? `${rated.length} értékelés alapján` : undefined} />
        <Fact label="Újra termesztem" value={lastRecommend ? EVAL_RECOMMEND_LABEL[lastRecommend] : undefined} detail={lastRecommend ? 'a legutóbbi értékelés szerint' : undefined} />
        <Fact label="Rögzített termés" value={totals.length ? totals.map((t) => formatAmount(t.amount, t.unit)).join(' · ') : undefined} detail={totals.length ? 'a napló termés-bejegyzéseiből' : undefined} />
      </FactGrid>

      {variety.notes && (
        <Block title="Megjegyzés">
          <p className={s.notes}>{variety.notes}</p>
        </Block>
      )}

      <Block title="Vetőmagkészlet" action={<Link to="/vetomag" className={s.blockLink}>Vetőmagkészlet</Link>}>
        {stock.length ? (
          <div className={s.list}>
            {stock.map((x) => (
              <div key={x.id} className={s.seedRow}>
                <span className={s.varietyText}>
                  <span className={s.varietyName}>{x.vintage_year ? `${x.vintage_year}-es évjárat` : 'Évjárat nélkül'}</span>
                  <span className={s.varietyDesc}>{[SEED_ORIGIN_LABEL[x.origin_type], x.supplier, x.quantity].filter(Boolean).join(' · ')}</span>
                </span>
                {!x.in_stock ? (
                  <Chip>Elfogyott</Chip>
                ) : x.viability === 'utolso' || x.viability === 'lejart' ? (
                  <Chip tone={x.viability === 'lejart' ? 'bad' : 'warn'}>{SEED_VIABILITY_LABEL[x.viability]}</Chip>
                ) : (
                  <Chip tone="good">Készleten</Chip>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={s.muted}>Ebből a fajtából nincs rögzített vetőmag.</p>
        )}
      </Block>

      <Block title="Termesztési előzmények">
        <CultivationList
          plantings={history}
          entries={entries}
          showVariety={false}
          onOpen={setPlantingEdit}
          empty="Ezt a fajtát még nem termesztetted. Ha tervbe veszed, az évek eredményei itt gyűlnek."
        />
      </Block>

      <Block
        title="Napló"
        action={
          <AddButton onClick={() => journal.create({ plant_id: plant.id, variety_id: variety.id, entry_date: journalDate(year) })}>
            Új bejegyzés
          </AddButton>
        }
      >
        <JournalPreview entries={entries} onOpen={journal.open} showYear limit={10} empty="Még nincs naplóbejegyzés ehhez a fajtához." />
      </Block>

      {journal.sheet}
      <VarietyEditSheet open={editing} onClose={() => setEditing(false)} plantId={plant.id} plantName={plant.name_hu} variety={variety} />
      <PlantingEditSheet
        open={plantingEdit !== null}
        onClose={() => setPlantingEdit(null)}
        planting={plantingEdit ?? undefined}
        year={plantingEdit?.year ?? year}
        initialTab="teny"
      />
    </div>
  );
}
