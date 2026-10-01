import { MONTHS_HU } from '@shared/labels.ts';
import { addDaysISO } from '@shared/domain/isoDate.ts';
import type { Settings } from '@shared/settings.ts';

/** Hétfővel kezdődő hét rövid napnevei. */
export const WEEKDAYS_SHORT = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'] as const;
/** A kis (éves) naptárhoz: a magyar kétbetűs kezdőbetűk */
export const WEEKDAYS_MINI = ['H', 'K', 'Sz', 'Cs', 'P', 'Sz', 'V'] as const;

/** 0 = hétfő … 6 = vasárnap */
export function weekdayIndex(iso: string): number {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
  return (d.getUTCDay() + 6) % 7;
}

export function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
}

/** A havi rács napjai: teljes hetek hétfőtől vasárnapig (az előző és következő hónap széleivel). */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const start = addDaysISO(first, -weekdayIndex(first));
  const cells = Math.ceil((weekdayIndex(first) + daysInMonth(month)) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => addDaysISO(start, i));
}

/** 'YYYY-MM' eltolása hónapokkal. */
export function shiftMonth(month: string, delta: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** „2026. október” */
export const monthTitle = (month: string) => `${month.slice(0, 4)}. ${MONTHS_HU[Number(month.slice(5, 7)) - 1]}`;

/** A beállított fagyhatár-napok jelölése. */
export function frostLabel(day: string, frost: Pick<Settings, 'lastFrost' | 'firstFrost'>): string | null {
  const md = day.slice(5);
  if (md === frost.lastFrost) return 'Várható utolsó tavaszi fagy';
  if (md === frost.firstFrost) return 'Várható első őszi fagy';
  return null;
}
