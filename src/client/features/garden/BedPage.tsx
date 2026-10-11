import { Copy, Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { BED_TYPE_LABEL, ROW_DIRECTION_LABEL, SUN_LABEL } from '@shared/labels.ts';
import type { PlantingListItem } from '@shared/types.ts';
import { AddButton, Block } from '../../components/ui/Detail.tsx';
import { PageHeader, ToolbarButton } from '../../components/ui/PageHeader.tsx';
import { formatArea, formatDimensions } from '../../lib/beds.ts';
import { colorVar } from '../../lib/colors.ts';
import { useBed, useJournal } from '../../lib/queries.ts';
import { useYear } from '../../lib/year.tsx';
import { PlantingEditSheet } from '../plan/PlantingEditSheet.tsx';
import { useChecksContext } from '../plan/useChecks.ts';
import { JournalPreview } from '../journal/JournalPreview.tsx';
import { journalDate } from '../journal/journalView.ts';
import { useJournalSheet } from '../journal/useJournalSheet.tsx';
import { BedEditSheet } from './BedEditSheet.tsx';
import { BedHistory } from './BedHistory.tsx';
import { HistorySheet } from './HistorySheet.tsx';
import { BedWorkspace } from './workspace/BedWorkspace.tsx';
import type { BackTo } from './workspace/openPlanting.ts';
import s from './BedPage.module.css';

/** Az ágyás oldala: maga a tervezés munkalapja, alatta a napló és az előzmények. */
export function BedPage() {
  const id = Number(useParams().id);
  const { year } = useYear();
  const { data: bed, isLoading, error } = useBed(id);
  // Ugyanaz a lap szerkeszt (az ágyás maga) vagy másol (az ágyás mintaként egy új ágyáshoz)
  const [bedSheet, setBedSheet] = useState<'edit' | 'copy' | null>(null);
  // A korábbi évek ültetései (előzmények) a meglévő ültetési lapon nyílnak
  const [historyPlanting, setHistoryPlanting] = useState<PlantingListItem | null>(null);
  const [historyYear, setHistoryYear] = useState<number | null>(null);
  const checksCtx = useChecksContext(year);
  const { data: entries = [] } = useJournal({ bed_id: id, year }, id > 0);
  const journal = useJournalSheet();
  // Az ágyáshoz kötött belépésnél (Éves terv, Figyelmeztetések) a vissza gomb oda visz
  const back = (useLocation().state as { back?: BackTo } | null)?.back ?? { to: '/kert', label: 'Kert' };

  if (isLoading) return <PageHeader title="Ágyás" back={back} />;
  if (error || !bed) {
    return (
      <>
        <PageHeader title="Nem található" back={back} />
        <p className={s.muted}>
          Ez az ágyás nem létezik. <Link to="/kert">Vissza a kerthez</Link>
        </p>
      </>
    );
  }

  const facts = [
    BED_TYPE_LABEL[bed.bed_type],
    formatDimensions(bed.length_cm, bed.width_cm),
    formatArea(bed.length_cm, bed.width_cm),
    `sorok ${ROW_DIRECTION_LABEL[bed.row_direction].toLocaleLowerCase('hu')}`,
    bed.sun ? SUN_LABEL[bed.sun].toLocaleLowerCase('hu') : null,
  ].filter(Boolean);

  /** A fejléc; telefonon mentetlen módosításnál az eszköztárban az Elvetés és a Mentés (`edit`) */
  const header = (edit: ReactNode) => (
    <PageHeader
      title={bed.name}
      color={colorVar(bed.color)}
      back={back}
      subtitle={
        <>
          {facts.join(' · ')} ·{' '}
          <button type="button" className={s.factsLink} onClick={() => setBedSheet('edit')}>
            Adatok
          </button>
        </>
      }
      actions={
        edit ?? (
          <>
            <ToolbarButton label="Másolás" onClick={() => setBedSheet('copy')}>
              <Copy size={17} strokeWidth={2.2} />
            </ToolbarButton>
            <ToolbarButton label="Szerkesztés" onClick={() => setBedSheet('edit')}>
              <Pencil size={17} strokeWidth={2.2} />
            </ToolbarButton>
          </>
        )
      }
    />
  );

  return (
    <div className={s.page}>
      {/* ágyásonként és évenként tiszta munkalap (a piszkozat az adott ágyás adott évéé) */}
      <BedWorkspace key={`${bed.id}-${year}`} bed={bed} year={year} header={header}>
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
          <BedHistory bed={bed} year={year} ctx={checksCtx} onOpen={setHistoryPlanting} onAdd={setHistoryYear} notices={false} />
        </Block>

        {bed.notes && (
          <Block title="Megjegyzés">
            <p className={s.notes}>{bed.notes}</p>
          </Block>
        )}
      </BedWorkspace>

      {journal.sheet}
      <BedEditSheet
        open={bedSheet !== null}
        onClose={() => setBedSheet(null)}
        bed={bedSheet === 'edit' ? bed : undefined}
        template={bedSheet === 'copy' ? bed : undefined}
      />
      <HistorySheet open={historyYear !== null} onClose={() => setHistoryYear(null)} bed={bed} year={historyYear ?? year - 1} />
      <PlantingEditSheet
        open={historyPlanting !== null}
        onClose={() => setHistoryPlanting(null)}
        planting={historyPlanting ?? undefined}
        year={historyPlanting?.year ?? year}
      />
    </div>
  );
}
