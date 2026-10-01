import { Lightbulb, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BED_TYPE_LABEL, ROW_DIRECTION_LABEL, SUN_LABEL } from '@shared/labels.ts';
import { findClashes } from '@shared/domain/geometry.ts';
import { DEFAULT_SETTINGS } from '@shared/settings.ts';
import type { PlantingListItem } from '@shared/types.ts';
import type { Suggestion } from '@shared/domain/suggestions.ts';
import { AddButton, Block, BlockActions, Fact, FactGrid, Muted } from '../../components/ui/Detail.tsx';
import { NoticeList } from '../../components/ui/Notice.tsx';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { formatArea, formatDimensions } from '../../lib/beds.ts';
import { colorVar } from '../../lib/colors.ts';
import { cropColor } from '../../lib/cropColors.ts';
import { formatDay } from '../../lib/format.ts';
import { useBed, useJournal, usePlantings, useSettings } from '../../lib/queries.ts';
import { useYear } from '../../lib/year.tsx';
import { shortDate } from '@shared/domain/isoDate.ts';
import { BedTimeline } from '../plan/BedTimeline.tsx';
import { PlantingEditSheet } from '../plan/PlantingEditSheet.tsx';
import { PlantingRow } from '../plan/PlantingRow.tsx';
import { SuggestionSheet } from '../plan/SuggestionSheet.tsx';
import { TimelineLegend } from '../plan/TimelineLegend.tsx';
import { byStart, effectiveBedId, placedInBed, plantingTitle } from '../plan/plantingView.ts';
import { useYearChecks } from '../plan/useChecks.ts';
import { defaultCursor } from '../plan/timeScale.ts';
import { JournalPreview } from '../journal/JournalPreview.tsx';
import { journalDate } from '../journal/journalView.ts';
import { useJournalSheet } from '../journal/useJournalSheet.tsx';
import { BedDiagram, type Strip } from './BedDiagram.tsx';
import { BedEditSheet } from './BedEditSheet.tsx';
import { BedHistory } from './BedHistory.tsx';
import { HistorySheet } from './HistorySheet.tsx';
import s from './BedPage.module.css';

export function BedPage() {
  const id = Number(useParams().id);
  const { year } = useYear();
  const { data: bed, isLoading, error } = useBed(id);
  const { data: plantings = [] } = usePlantings(year);
  const { data: settings } = useSettings();
  const [editing, setEditing] = useState(false);
  const [plantingEdit, setPlantingEdit] = useState<PlantingListItem | 'new' | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const checks = useYearChecks(year);
  const [historyYear, setHistoryYear] = useState<number | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [picked, setPicked] = useState<{ suggestion: Suggestion; bedId: number } | null>(null);
  const { data: entries = [] } = useJournal({ bed_id: id, year }, id > 0);
  const journal = useJournalSheet();

  const view = useMemo(() => {
    if (!bed) return null;
    const mine = plantings.filter((p) => effectiveBedId(p) === bed.id).sort(byStart);
    const placed = placedInBed(plantings, bed);
    const clashes = findClashes(placed);
    return { mine, placed, clashes };
  }, [plantings, bed]);

  if (isLoading) return <PageHeader title="Ágyás" back={{ to: '/kert', label: 'Kert' }} />;
  if (error || !bed) {
    return (
      <>
        <PageHeader title="Nem található" back={{ to: '/kert', label: 'Kert' }} />
        <p className={s.muted}>
          Ez az ágyás nem létezik. <Link to="/kert">Vissza a kerthez</Link>
        </p>
      </>
    );
  }

  const color = colorVar(bed.color);
  const day = cursor && cursor.startsWith(String(year)) ? cursor : defaultCursor(year);
  // Csak az a sáv piros, amelyik a kiválasztott napon ténylegesen ütközik
  const clashIds = new Set(
    view?.clashes.filter((c) => c.period.start <= day && day < c.period.end).flatMap((c) => [c.a, c.b]),
  );
  const stripsAtDay: Strip[] = (view?.placed ?? [])
    .filter((o) => o.period.start <= day && day < o.period.end)
    .map((o) => ({
      key: o.id,
      placement: o.placement,
      label: o.planting.plant_name,
      color: cropColor(o.planting.crop_group_code),
      variant: clashIds.has(o.id) ? 'clash' : 'normal',
      onClick: () => setPlantingEdit(o.planting),
    }));
  const inUse =
    bed.active_from_year || bed.active_to_year
      ? `${bed.active_from_year ?? '…'} – ${bed.active_to_year ?? 'jelenleg is'}`
      : 'folyamatosan';

  return (
    <div className={s.page}>
      <PageHeader
        title={bed.name}
        color={color}
        back={{ to: '/kert', label: 'Kert' }}
        subtitle={`${BED_TYPE_LABEL[bed.bed_type]} · ${formatDimensions(bed.length_cm, bed.width_cm)} · ${formatArea(bed.length_cm, bed.width_cm)}`}
        actions={
          <ToolbarButton label="Szerkesztés" onClick={() => setEditing(true)}>
            <Pencil size={17} strokeWidth={2.2} />
          </ToolbarButton>
        }
      />

      <FactGrid>
        <Fact label="Méret" value={formatDimensions(bed.length_cm, bed.width_cm)} detail={formatArea(bed.length_cm, bed.width_cm)} />
        <Fact label="Sorok iránya" value={ROW_DIRECTION_LABEL[bed.row_direction]} />
        <Fact label="Napfény" value={bed.sun ? SUN_LABEL[bed.sun] : undefined} />
        <Fact label="Használatban" value={inUse} />
        <Fact label="Típus" value={BED_TYPE_LABEL[bed.bed_type]} />
        <Fact label="Talaj" value={bed.soil} />
        <Fact label="Öntözés" value={bed.irrigation} />
        <Fact
          label="Elhelyezkedés"
          value={bed.pos_x_cm != null && bed.pos_y_cm != null ? `${bed.pos_x_cm} / ${bed.pos_y_cm} cm` : undefined}
          detail={bed.rotation_deg ? `${bed.rotation_deg}°-kal elforgatva` : undefined}
        />
      </FactGrid>

      <Block title={`Idővonal ${year}`}>
        {view && view.placed.length > 0 ? (
          <>
            <BedTimeline
              year={year}
              bed={bed}
              items={view.placed}
              clashes={view.clashes}
              frost={settings ?? DEFAULT_SETTINGS}
              cursor={day}
              onPickDate={setCursor}
              onSelect={setPlantingEdit}
            />
            <TimelineLegend plantings={view.placed.map((o) => o.planting)} tray />
            <NoticeList
              items={view.clashes.map((c) => {
                const a = view.placed.find((o) => o.id === c.a)!.planting;
                const b = view.placed.find((o) => o.id === c.b)!.planting;
                return {
                  level: 'figyelem' as const,
                  message: `Helyütközés ${shortDate(c.period.start)} – ${shortDate(c.period.end)}: ${plantingTitle(a)} és ${plantingTitle(b)} ugyanazt a sávot foglalná.`,
                };
              })}
            />
          </>
        ) : (
          <Muted>
            Itt látszik majd, mikor melyik rész foglalt: vízszintesen az év hónapjai, függőlegesen az ágyás hossza.
            Vegyél fel egy ültetést dátumokkal és elhelyezéssel.
          </Muted>
        )}
      </Block>

      <Block title={`Felülnézet · ${formatDay(day)}`}>
        <BedDiagram
          lengthCm={bed.length_cm}
          widthCm={bed.width_cm}
          rowDirection={bed.row_direction}
          color={bed.color}
          strips={stripsAtDay}
          caption={
            view && view.placed.length > 0
              ? stripsAtDay.length
                ? `${formatDay(day)}: ${stripsAtDay.map((x) => x.label).join(', ')}. Az idővonalra kattintva másik napot választhatsz.`
                : `${formatDay(day)}: az ágyás üres. Az idővonalra kattintva másik napot választhatsz.`
              : undefined
          }
        />
      </Block>

      <Block
        title={`Ültetések ${year}`}
        action={
          <BlockActions>
            <AddButton icon={<Lightbulb size={15} strokeWidth={2.4} />} onClick={() => setSuggesting(true)}>
              Mi kerülhet ide?
            </AddButton>
            <AddButton onClick={() => setPlantingEdit('new')}>Új ültetés</AddButton>
          </BlockActions>
        }
      >
        {view && view.mine.length > 0 ? (
          <div className={s.list}>
            {view.mine.map((p) => (
              <PlantingRow
                key={p.id}
                planting={p}
                year={year}
                bed={bed}
                issues={checks.byPlanting.get(p.id)}
                onOpen={() => setPlantingEdit(p)}
              />
            ))}
          </div>
        ) : (
          <Muted>Ebben az évben még nincs ültetés ebben az ágyásban.</Muted>
        )}
      </Block>

      <Block
        title={`Napló ${year}`}
        action={<AddButton onClick={() => journal.create({ bed_id: bed.id, entry_date: journalDate(year) })}>Új bejegyzés</AddButton>}
      >
        <JournalPreview
          entries={entries}
          onOpen={journal.open}
          showBed={false}
          moreLink={`/naplo?agyas=${bed.id}`}
          empty="Ebben az évben még nincs bejegyzés ehhez az ágyáshoz."
        />
      </Block>

      <Block
        title="Előzmények (vetésforgó)"
        action={<AddButton onClick={() => setHistoryYear(year - 1)}>Előzmény rögzítése</AddButton>}
      >
        <BedHistory bed={bed} year={year} ctx={checks.ctx} onOpen={setPlantingEdit} onAdd={setHistoryYear} />
      </Block>

      {bed.notes && (
        <Block title="Megjegyzés">
          <p className={s.notes}>{bed.notes}</p>
        </Block>
      )}

      {journal.sheet}
      <BedEditSheet open={editing} onClose={() => setEditing(false)} bed={bed} />
      <HistorySheet open={historyYear !== null} onClose={() => setHistoryYear(null)} bed={bed} year={historyYear ?? year - 1} />
      <SuggestionSheet
        open={suggesting}
        onClose={() => setSuggesting(false)}
        year={year}
        request={{ bedId: bed.id }}
        onPick={(sg, toBed) => {
          setSuggesting(false);
          setPicked({ suggestion: sg, bedId: toBed });
          setPlantingEdit('new');
        }}
      />
      <PlantingEditSheet
        open={plantingEdit !== null}
        onClose={() => {
          setPlantingEdit(null);
          setPicked(null);
        }}
        planting={plantingEdit && plantingEdit !== 'new' ? plantingEdit : undefined}
        bedId={picked?.bedId ?? bed.id}
        suggestion={plantingEdit === 'new' ? picked?.suggestion : undefined}
        year={year}
      />
    </div>
  );
}
