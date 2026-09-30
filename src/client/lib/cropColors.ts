import type { ListColorName } from '@shared/labels.ts';
import { colorVar } from './colors.ts';

/**
 * Zöldségcsoportonkénti szín az idővonalakon – így ránézésre látszik a vetésforgó
 * (termés → gyökér → hüvelyes → levél). Saját csoportnál a kódból képzett állandó szín.
 */
const BY_GROUP: Record<string, ListColorName> = {
  termes: 'red',
  gyoker: 'orange',
  hagymas: 'yellow',
  level: 'green',
  szar_virag: 'teal',
  huvelyes: 'purple',
  fuszer: 'mint',
  kisero: 'pink',
  evelo: 'brown',
};
const FALLBACK: ListColorName[] = ['indigo', 'cyan', 'blue', 'gray'];

export function cropColorName(groupCode: string | null | undefined): ListColorName {
  if (!groupCode) return 'gray';
  const known = BY_GROUP[groupCode];
  if (known) return known;
  const hash = [...groupCode].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return FALLBACK[hash % FALLBACK.length]!;
}

export const cropColor = (groupCode: string | null | undefined) => colorVar(cropColorName(groupCode));
