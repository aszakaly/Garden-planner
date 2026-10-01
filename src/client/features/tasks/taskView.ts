import type { TaskCategory, TaskItem } from '@shared/domain/tasks.ts';
import { colorVar } from '../../lib/colors.ts';
import { addDays, todayISO } from '../../lib/format.ts';

export const CATEGORY_COLOR: Record<TaskCategory, string> = {
  beszerzes: 'var(--c-purple)',
  vetes: 'var(--c-green)',
  kiultetes: 'var(--c-teal)',
  betakaritas: 'var(--c-orange)',
  felszabadul: 'var(--c-gray)',
  sajat: 'var(--c-blue)',
};

/** A feladat színe: az ágyásé, ágyás nélkül a típusé. */
export const taskColor = (t: TaskItem) => (t.bed_color ? colorVar(t.bed_color) : CATEGORY_COLOR[t.category]);

/** Az „Ez a hét” lista ennyi napra visszamenőleg mutatja a lejárt (el nem végzett) feladatokat. */
export const OVERDUE_DAYS = 30;

export interface DateRange {
  from: string;
  to: string;
}

export const weekRange = (today = todayISO()): DateRange => ({ from: addDays(today, -OVERDUE_DAYS), to: addDays(today, 6) });
export const yearRange = (year: number): DateRange => ({ from: `${year}-01-01`, to: `${year}-12-31` });

/** 'YYYY-MM' hónap első és utolsó napja. */
export function monthRange(month: string): DateRange {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export const isDone = (t: TaskItem) => t.done_on !== null;
export const isOverdue = (t: TaskItem, today = todayISO()) => !isDone(t) && t.date < today;
