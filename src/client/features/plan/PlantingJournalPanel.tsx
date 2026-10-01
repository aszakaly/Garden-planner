import { Plus } from 'lucide-react';
import { harvestTotals } from '@shared/domain/journal.ts';
import type { PlantingListItem } from '@shared/types.ts';
import { useJournal } from '../../lib/queries.ts';
import { JournalRow } from '../journal/JournalRow.tsx';
import { formatAmount, journalDate } from '../journal/journalView.ts';
import { useJournalSheet } from '../journal/useJournalSheet.tsx';
import s from './PlantingEditSheet.module.css';

/** Az ültetés naplóbejegyzései és új bejegyzés felvétele (előre kitöltött kapcsolattal). */
export function PlantingJournalPanel({ planting }: { planting: PlantingListItem }) {
  const { data: entries = [], isLoading } = useJournal({ planting_id: planting.id });
  const sheet = useJournalSheet();
  const totals = harvestTotals(entries);
  const date = journalDate(planting.year);

  return (
    <>
      <div className={s.journalCard}>
        {entries.map((e) => (
          <JournalRow key={e.id} entry={e} onOpen={sheet.open} showBed={false} showYear={!e.entry_date.startsWith(`${planting.year}-`)} />
        ))}
        {!isLoading && entries.length === 0 && (
          <p className={s.journalEmpty}>Még nincs bejegyzés ehhez az ültetéshez. Jegyezd fel a kelést, a termést vagy a betegségeket.</p>
        )}
        <button type="button" className={s.journalAdd} onClick={() => sheet.create({ planting_id: planting.id, entry_date: date })}>
          <Plus size={16} strokeWidth={2.6} />
          Új bejegyzés
        </button>
      </div>
      {totals.length > 0 && (
        <p className={s.journalTotals}>Összes rögzített termés: {totals.map((t) => formatAmount(t.amount, t.unit)).join(' · ')}</p>
      )}
      {sheet.sheet}
    </>
  );
}
