import { MONTHS_SHORT_HU } from '@shared/labels.ts';
import { addDaysISO, diffDays, isoFromMonthDay } from '@shared/domain/isoDate.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** Vízszintes időskála egy naptári évre (SVG-koordinátákban). */
export function makeTimeScale(year: number, x0: number, width: number) {
  const start = `${year}-01-01`;
  const next = `${year + 1}-01-01`;
  const days = diffDays(start, next);
  const x = (iso: string) => x0 + (Math.min(Math.max(diffDays(start, iso), 0), days) / days) * width;
  const months = MONTHS_SHORT_HU.map((label, m) => ({
    m,
    label,
    x0: x(`${year}-${pad(m + 1)}-01`),
    x1: x(m === 11 ? next : `${year}-${pad(m + 2)}-01`),
  }));
  const dateAt = (px: number) => addDaysISO(start, Math.min(days - 1, Math.max(0, Math.round(((px - x0) / width) * days))));
  const inYear = (iso: string) => iso >= start && iso < next;
  return { x, months, dateAt, inYear, start, next, frost: (md: string) => x(isoFromMonthDay(year, md)) };
}

export type TimeScale = ReturnType<typeof makeTimeScale>;

/** A kurzor alapértéke: ma, ha a kiválasztott évben vagyunk, egyébként június közepe. */
export function defaultCursor(year: number, today = new Date()): string {
  return today.getFullYear() === year
    ? `${year}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    : `${year}-06-15`;
}
