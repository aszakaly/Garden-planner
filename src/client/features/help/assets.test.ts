import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sizes from './shotSizes.json';

const dir = new URL('../../public/sugo/', import.meta.url);
const source = readFileSync(new URL('./HelpPage.tsx', import.meta.url), 'utf8');
const files = [...source.matchAll(/file="([^"]+)"/g)].map((m) => m[1]!);

describe('Súgó', () => {
  it('hivatkozik képekre', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('a bemutatóvideó és az előnézeti képe megvan', () => {
    expect(existsSync(new URL('bemutato.mp4', dir))).toBe(true);
    expect(existsSync(new URL('bemutato.jpg', dir))).toBe(true);
  });

  it.each(files)('a %s kép létezik a public/sugo mappában', (name) => {
    expect(existsSync(new URL(name, dir))).toBe(true);
    // A méret is ismert, különben betöltéskor ugrál az oldal (npm run sugo frissíti)
    expect(sizes).toHaveProperty([name]);
  });
});
