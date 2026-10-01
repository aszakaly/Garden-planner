import { ChevronRight } from 'lucide-react';
import { harvestTotals } from '@shared/domain/journal.ts';
import { EVAL_RECOMMEND_LABEL, PLANTING_STATUS_LABEL } from '@shared/labels.ts';
import type { JournalEntry, PlantingListItem } from '@shared/types.ts';
import { Chip } from '../../components/ui/Chip.tsx';
import { StarRating } from '../../components/ui/StarRating.tsx';
import { formatAmount } from '../journal/journalView.ts';
import { datesSummary, STATUS_TONE } from '../plan/plantingView.ts';
import s from './CultivationList.module.css';

interface Props {
  plantings: PlantingListItem[];
  /** A kapcsolódó naplóbejegyzések (a termés összesítéséhez) */
  entries?: JournalEntry[];
  showVariety?: boolean;
  onOpen: (p: PlantingListItem) => void;
  empty: string;
}

/** Korábbi és idei termesztések évenként: hol, mikor, mennyire sikerült – a saját tudásbázis. */
export function CultivationList({ plantings, entries = [], showVariety = true, onOpen, empty }: Props) {
  if (!plantings.length) return <p className={s.empty}>{empty}</p>;
  const byPlanting = Map.groupBy(entries, (e) => e.planting_id ?? 0);
  return (
    <div className={s.list}>
      {plantings.map((p) => {
        const totals = harvestTotals(byPlanting.get(p.id) ?? []);
        const title = [showVariety ? (p.variety_name ?? 'Fajta nélkül') : null, p.bed_name].filter(Boolean).join(' · ');
        return (
          <button key={p.id} type="button" className={s.row} onClick={() => onOpen(p)}>
            <span className={s.year}>{p.year}</span>
            <span className={s.body}>
              <span className={s.title}>{title || 'Ágyás nélkül'}</span>
              {!p.is_history && <span className={s.meta}>{datesSummary(p, p.year)}</span>}
              <span className={s.facts}>
                <StarRating value={p.eval_success} label="Siker" size={13} />
                {p.eval_yield && <span>Termés: {p.eval_yield}</span>}
                {totals.length > 0 && <span>Naplóban: {totals.map((t) => formatAmount(t.amount, t.unit)).join(', ')}</span>}
                {p.eval_recommend && <span>Újra: {EVAL_RECOMMEND_LABEL[p.eval_recommend].toLowerCase()}</span>}
              </span>
              {p.eval_notes && <span className={s.notes}>{p.eval_notes}</span>}
            </span>
            <span className={s.side}>
              {p.is_history ? <Chip>Előzmény</Chip> : <Chip tone={STATUS_TONE[p.status]}>{PLANTING_STATUS_LABEL[p.status]}</Chip>}
              <ChevronRight size={16} className={s.chevron} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
