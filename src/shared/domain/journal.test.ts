import { describe, expect, it } from 'vitest';
import { foldText, ftsQuery, harvestTotals, matchesAllTokens, normalizeTags } from './journal.ts';

describe('napló', () => {
  it('ékezet- és kisbetű-független szöveg', () => {
    expect(foldText('Lisztharmat a LEVELEKEN, őszibarack')).toBe('lisztharmat a leveleken, oszibarack');
  });

  it('FTS-lekérdezés: szavankénti előtag-keresés, a speciális karakterek kiszűrve', () => {
    expect(ftsQuery('liszt harmat')).toBe('"liszt"* "harmat"*');
    expect(ftsQuery('"levél" OR -x*')).toBe('"levél"* "OR"* "x"*');
    expect(ftsQuery('  ,; ')).toBeNull();
  });

  it('nevek egyezése szó eleji előtaggal, ékezet nélkül is', () => {
    expect(matchesAllTokens('Paradicsom Ökörszív Emelt ágyás 1', 'okor emelt')).toBe(true);
    expect(matchesAllTokens('Paradicsom Ökörszív', 'szív')).toBe(false);
  });

  it('címkék egységesítése', () => {
    expect(normalizeTags('#Lisztharmat, korai fagy; lisztharmat,,')).toBe('lisztharmat, korai fagy');
  });

  it('termés összesítése egységenként', () => {
    expect(
      harvestTotals([
        { entry_type: 'termes', amount: 1.25, unit: 'kg' },
        { entry_type: 'termes', amount: 2.5, unit: 'kg' },
        { entry_type: 'termes', amount: 12, unit: null },
        { entry_type: 'megfigyeles', amount: 3, unit: 'kg' },
      ]),
    ).toEqual([
      { unit: 'kg', amount: 3.75 },
      { unit: 'db', amount: 12 },
    ]);
  });
});
