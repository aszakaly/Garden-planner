import { useState, type ReactNode } from 'react';
import type { JournalEntry } from '@shared/types.ts';
import { JournalEntrySheet, type JournalDefaults } from './JournalEntrySheet.tsx';

export interface JournalSheet {
  open: (entry: JournalEntry) => void;
  create: (defaults?: JournalDefaults) => void;
  sheet: ReactNode;
}

/** Naplóbejegyzés megnyitása vagy új felvétele bármelyik nézetből. */
export function useJournalSheet(): JournalSheet {
  const [state, setState] = useState<{ entry?: JournalEntry; defaults?: JournalDefaults; key: number } | null>(null);
  return {
    open: (entry) => setState({ entry, key: Date.now() }),
    create: (defaults) => setState({ defaults, key: Date.now() }),
    sheet: state && (
      <JournalEntrySheet key={state.key} entry={state.entry} defaults={state.defaults} onClose={() => setState(null)} />
    ),
  };
}
