/** Határozott névelő a szó elé: „a paradicsom”, „az uborka”. */
export function withArticle(word: string, capitalize = false): string {
  const article = /^[aáeéiíoóöőuúüű]/i.test(word.trim()) ? 'az' : 'a';
  return `${capitalize ? article.charAt(0).toUpperCase() + article.slice(1) : article} ${word}`;
}

export const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('hu') + s.slice(1);

/**
 * Hátulképzett-e egy szám kiejtett alakja (a toldalék hangrendjéhez):
 * három, hat, nyolc, húsz, harminc, hatvan, nyolcvan, száz → -ban/-tól; a többi → -ben/-től.
 */
function backVowelNumber(n: number): boolean {
  const abs = Math.abs(n);
  const ones = abs % 10;
  const tens = Math.floor(abs / 10) % 10;
  const hundreds = Math.floor(abs / 100) % 10;
  if (ones) return [3, 6, 8].includes(ones);
  if (tens) return [2, 3, 6, 8].includes(tens);
  return hundreds > 0; // száz → -ban; ezer → -ben
}

/** „2026-ban”, „2027-ben” */
export const yearIn = (y: number) => `${y}-${backVowelNumber(y) ? 'ban' : 'ben'}`;

/** „2028-tól”, „2029-től” */
export const yearFrom = (y: number) => `${y}-${backVowelNumber(y) ? 'tól' : 'től'}`;
