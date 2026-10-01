import { Bug, Carrot, Eye, Microscope, NotebookPen, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { JournalType } from '@shared/labels.ts';
import type { JournalEntry } from '@shared/types.ts';
import { todayISO } from '../../lib/format.ts';

export const JOURNAL_TYPE_COLOR: Record<JournalType, string> = {
  megfigyeles: 'var(--c-blue)',
  termes: 'var(--c-orange)',
  betegseg: 'var(--c-red)',
  kartevo: 'var(--c-pink)',
  problema: 'var(--c-yellow)',
  altalanos: 'var(--c-gray)',
};

export const JOURNAL_TYPE_ICON: Record<JournalType, LucideIcon> = {
  megfigyeles: Eye,
  termes: Carrot,
  betegseg: Microscope,
  kartevo: Bug,
  problema: TriangleAlert,
  altalanos: NotebookPen,
};

export const JOURNAL_PLACEHOLDER: Record<JournalType, string> = {
  megfigyeles: 'Mit láttál? pl. kikeltek a magok, virágzik',
  termes: 'pl. első szedés, szép egészséges termések',
  betegseg: 'Milyen tünetek? Mit tettél ellene?',
  kartevo: 'Milyen kártevő, mekkora a kár, mit tettél?',
  problema: 'pl. jégkár, kiszáradt, rossz csírázás',
  altalanos: 'Bármi, amit érdemes megjegyezni',
};

/** A termés mennyiségének egységei. */
export const UNITS = ['kg', 'dkg', 'g', 'db', 'fej', 'csokor', 'liter'] as const;

const nf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });
export const formatAmount = (amount: number, unit: string | null) => `${nf.format(amount)} ${unit ?? 'db'}`;

/** „Paradicsom – Ökörszív · Emelt ágyás 1” */
export function entryContext(e: Pick<JournalEntry, 'plant_name' | 'variety_name' | 'bed_name'>, withBed = true): string {
  const plant = e.plant_name ? (e.variety_name ? `${e.plant_name} – ${e.variety_name}` : e.plant_name) : null;
  return [plant, withBed ? e.bed_name : null].filter(Boolean).join(' · ');
}

/** Új bejegyzés kiinduló napja egy adott évhez: idén a mai nap, korábbi évben az év utolsó napja. */
export function journalDate(year: number, today = todayISO()): string {
  return Number(today.slice(0, 4)) <= year ? today : `${year}-12-31`;
}
