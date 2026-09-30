const dayFmt = new Intl.DateTimeFormat('hu-HU', { month: 'long', day: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('hu-HU', { weekday: 'long' });

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** „szeptember 30.” */
export function formatDay(iso: string): string {
  return dayFmt.format(parseISODate(iso));
}

/** „szept. 30.” */
export function formatShort(iso: string): string {
  return shortFmt.format(parseISODate(iso));
}

/** „szerda” */
export function formatWeekday(iso: string): string {
  return weekdayFmt.format(parseISODate(iso));
}

/** Relatív napcím: Ma, Holnap, Tegnap vagy a hét napja nagybetűvel. */
export function relativeDayLabel(iso: string, today = todayISO()): string {
  const diff = Math.round((parseISODate(iso).getTime() - parseISODate(today).getTime()) / 86_400_000);
  if (diff === 0) return 'Ma';
  if (diff === 1) return 'Holnap';
  if (diff === -1) return 'Tegnap';
  const w = formatWeekday(iso);
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Határozott névelő a szó elé: „a paradicsom”, „az uborka”. */
export function withArticle(word: string, capitalize = false): string {
  const article = /^[aáeéiíoóöőuúüű]/i.test(word.trim()) ? 'az' : 'a';
  return `${capitalize ? article.charAt(0).toUpperCase() + article.slice(1) : article} ${word}`;
}
