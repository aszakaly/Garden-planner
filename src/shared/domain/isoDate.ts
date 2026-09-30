import { MONTHS_SHORT_HU } from '../labels.ts';

/**
 * Naptári dátumok 'YYYY-MM-DD' alakban. A számolás UTC-ben történik,
 * így a nyári időszámítás váltása nem csúsztatja el a napokat.
 */

const DAY_MS = 86_400_000;

function toUTC(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const isISODate = (v: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** 'HH-NN' + év → ISO dátum (febr. 29. nem szökőévben febr. 28. lesz). */
export function isoFromMonthDay(year: number, md: string): string {
  const day = md === '02-29' && !isLeap(year) ? '02-28' : md;
  return `${year}-${day}`;
}

export function addDaysISO(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * DAY_MS);
}

/** Napok száma a-tól b-ig (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export const maxISO = (a: string, b: string) => (a > b ? a : b);
export const minISO = (a: string, b: string) => (a < b ? a : b);

/** 'HH-NN' rész egy ISO dátumból. */
export const monthDayOf = (iso: string) => iso.slice(5, 10);

/** Rövid magyar dátum hónap-nap alapján: '2027-05-10' vagy '05-10' → „máj. 10.” */
export function shortDate(isoOrMd: string): string {
  const md = isoOrMd.length > 5 ? monthDayOf(isoOrMd) : isoOrMd;
  return `${MONTHS_SHORT_HU[Number(md.slice(0, 2)) - 1]}. ${Number(md.slice(3, 5))}.`;
}

/** Benne van-e a hónap-nap az (akár évhatáron átnyúló) időszakban. */
export function monthDayInRange(md: string, from: string, to: string): boolean {
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}
