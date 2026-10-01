import type { CSSProperties } from 'react';
import { parseTags } from '@shared/domain/journal.ts';
import { JOURNAL_TYPE_LABEL } from '@shared/labels.ts';
import type { JournalEntry } from '@shared/types.ts';
import { StarRating } from '../../components/ui/StarRating.tsx';
import { formatShort } from '../../lib/format.ts';
import { entryContext, formatAmount, JOURNAL_TYPE_COLOR, JOURNAL_TYPE_ICON } from './journalView.ts';
import s from './Journal.module.css';

interface Props {
  entry: JournalEntry;
  onOpen: (entry: JournalEntry) => void;
  /** A dátum megjelenítése (napi listában elhagyható) */
  showDate?: boolean;
  /** Az ágyás neve (az ágyás saját oldalán elhagyható) */
  showBed?: boolean;
  /** Az év is látszódjon a dátumban */
  showYear?: boolean;
}

/** Egy naplóbejegyzés a listákban: típus, kapcsolat, szöveg, termés, minőség, címkék. */
export function JournalRow({ entry: e, onOpen, showDate = true, showBed = true, showYear = false }: Props) {
  const Icon = JOURNAL_TYPE_ICON[e.entry_type];
  const context = entryContext(e, showBed);
  const tags = parseTags(e.tags);
  return (
    <div className={s.row}>
      <button type="button" className={s.inner} onClick={() => onOpen(e)} style={{ '--c': JOURNAL_TYPE_COLOR[e.entry_type] } as CSSProperties}>
        <span className={s.icon} aria-hidden>
          <Icon size={15} strokeWidth={2.3} />
        </span>
        <span className={s.body}>
          <span className={s.top}>
            <span className={s.type}>{JOURNAL_TYPE_LABEL[e.entry_type]}</span>
            {context && <span className={s.context}>{context}</span>}
            {showDate && (
              <span className={s.date}>
                {showYear ? `${e.entry_date.slice(0, 4)}. ` : ''}
                {formatShort(e.entry_date)}
              </span>
            )}
          </span>
          {e.body && <span className={s.text}>{e.body}</span>}
          {(e.amount != null || e.quality || tags.length > 0) && (
            <span className={s.meta}>
              {e.amount != null && <span className={s.amount}>{formatAmount(e.amount, e.unit)}</span>}
              <StarRating value={e.quality} label="Minőség" size={12} />
              {tags.map((t) => (
                <span key={t} className={s.tag}>
                  #{t}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
