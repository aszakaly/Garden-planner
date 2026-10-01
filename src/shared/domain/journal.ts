import { JOURNAL_TYPE_LABEL } from '../labels.ts';
import type { JournalEntry } from '../types.ts';

/** Ékezet- és kisbetű-független összehasonlításhoz. */
export function foldText(s: string): string {
  return s.toLocaleLowerCase('hu').normalize('NFD').replace(/\p{M}/gu, '');
}

/** A keresőkifejezés szavai (betűk és számok). */
export const searchTokens = (q: string) => q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * FTS5 lekérdezés a felhasználó által beírt szövegből: minden szóra előtag-keresés,
 * a szavak között ÉS kapcsolat. A speciális FTS-karakterek nem jutnak át.
 */
export function ftsQuery(q: string): string | null {
  const tokens = searchTokens(q);
  return tokens.length ? tokens.map((t) => `"${t}"*`).join(' ') : null;
}

/** A bejegyzéshez kapcsolt nevek (növény, fajta, ágyás, típus) – a kereséshez. */
export function entryContextText(e: Pick<JournalEntry, 'plant_name' | 'variety_name' | 'bed_name' | 'entry_type'>): string {
  return foldText([e.plant_name, e.variety_name, e.bed_name, JOURNAL_TYPE_LABEL[e.entry_type]].filter(Boolean).join(' '));
}

/** Minden keresett szó előfordul-e (szó elején) a szövegben. */
export function matchesAllTokens(text: string, q: string): boolean {
  const words = searchTokens(foldText(text));
  return searchTokens(foldText(q)).every((t) => words.some((w) => w.startsWith(t)));
}

/** Címkék egységes alakban: kisbetű, '#' nélkül, ismétlés nélkül, vesszővel elválasztva. */
export function normalizeTags(raw: string): string {
  return [...new Set(parseTags(raw))].join(', ');
}

export function parseTags(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((t) => t.replace(/#/g, '').trim().toLocaleLowerCase('hu'))
    .filter(Boolean);
}

/** A termés-bejegyzések mennyisége egységenként összegezve (pl. kg → 12,5). */
export function harvestTotals(entries: Pick<JournalEntry, 'entry_type' | 'amount' | 'unit'>[]): { unit: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const e of entries) {
    if (e.entry_type !== 'termes' || e.amount == null) continue;
    const unit = e.unit?.trim() || 'db';
    sums.set(unit, (sums.get(unit) ?? 0) + e.amount);
  }
  return [...sums.entries()].map(([unit, amount]) => ({ unit, amount: Math.round(amount * 100) / 100 }));
}
