import { Link } from 'react-router';
import type { JournalEntry } from '@shared/types.ts';
import { JournalRow } from './JournalRow.tsx';
import s from './Journal.module.css';

interface Props {
  entries: JournalEntry[];
  onOpen: (entry: JournalEntry) => void;
  /** Ennyi bejegyzés látszik; a többihez a napló szűrt nézete vezet */
  limit?: number;
  moreLink?: string;
  showBed?: boolean;
  showYear?: boolean;
  empty: string;
}

/** Naplóbejegyzések egy adatlap blokkjában (ágyás, növény, fajta). */
export function JournalPreview({ entries, onOpen, limit = 6, moreLink, showBed = true, showYear = false, empty }: Props) {
  if (!entries.length) return <p className={s.previewEmpty}>{empty}</p>;
  return (
    <div className={s.preview}>
      {entries.slice(0, limit).map((e) => (
        <JournalRow key={e.id} entry={e} onOpen={onOpen} showBed={showBed} showYear={showYear} />
      ))}
      {entries.length > limit && moreLink && (
        <Link to={moreLink} className={s.previewMore}>
          Mind a naplóban ({entries.length})
        </Link>
      )}
    </div>
  );
}
