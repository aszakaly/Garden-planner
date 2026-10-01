/** Sorszámnak tekintett szám: teljes számjegysor, amelyet nem követ betű (az „E2E” 2-ese nem az). */
const ORDINAL = /(?<!\d)\d+(?![\d\p{L}])/gu;

/**
 * `count` darab még nem foglalt ágyásnév sorszámozással, több egyforma ágyás felvételéhez.
 * A név utolsó sorszámát lépteti, bárhol áll („Emelt ágyás 1” → 2, „Emelt ágyás 7.” → „8.”,
 * „1. ágyás” → „2. ágyás”, „E1” → „E2”), a nullákkal kitöltött szélességgel együtt. Sorszám
 * nélküli névnél a végére tesz sorszámot: 1-től, ha a név még szabad, különben 2-től; egyetlen
 * szabad nevet változatlanul hagy. A foglalt neveket – kis- és nagybetűtől függetlenül – kihagyja.
 */
export function numberedNames(name: string, count: number, taken: Iterable<string>): string[] {
  const key = (n: string) => n.trim().toLocaleLowerCase('hu');
  const used = new Set([...taken].map(key));
  const trimmed = name.trim();
  const last = [...trimmed.matchAll(ORDINAL)].at(-1);

  let prefix = `${trimmed} `;
  let suffix = '';
  let start = used.has(key(trimmed)) ? 2 : 1;
  let width = 0;
  if (last) {
    prefix = trimmed.slice(0, last.index);
    suffix = trimmed.slice(last.index + last[0].length);
    start = Number(last[0]);
    width = last[0].length;
  } else if (count === 1 && start === 1) {
    return [trimmed];
  }

  const names: string[] = [];
  for (let n = start; names.length < count; n++) {
    const candidate = prefix + String(n).padStart(width, '0') + suffix;
    if (!used.has(key(candidate))) names.push(candidate);
  }
  return names;
}
