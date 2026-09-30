/** Határozott névelő a szó elé: „a paradicsom”, „az uborka”. */
export function withArticle(word: string, capitalize = false): string {
  const article = /^[aáeéiíoóöőuúüű]/i.test(word.trim()) ? 'az' : 'a';
  return `${capitalize ? article.charAt(0).toUpperCase() + article.slice(1) : article} ${word}`;
}
