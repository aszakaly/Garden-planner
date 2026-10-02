import { describe, expect, it } from 'vitest';
import { numberedNames } from './beds.ts';

describe('ágyásnevek sorszámozása', () => {
  it('a név végi sorszámot folytatja, a foglaltakat kihagyja', () => {
    expect(numberedNames('Emelt ágyás 1', 3, ['Emelt ágyás 1'])).toEqual(['Emelt ágyás 2', 'Emelt ágyás 3', 'Emelt ágyás 4']);
    expect(numberedNames('Emelt ágyás 2', 3, ['Emelt ágyás 1', 'emelt ágyás 3'])).toEqual([
      'Emelt ágyás 2',
      'Emelt ágyás 4',
      'Emelt ágyás 5',
    ]);
  });

  it('sorszám nélküli névnél 1-től számoz, ha a név szabad; ha foglalt, 2-től', () => {
    expect(numberedNames('Emelt ágyás', 3, [])).toEqual(['Emelt ágyás 1', 'Emelt ágyás 2', 'Emelt ágyás 3']);
    expect(numberedNames('Paradicsomos', 2, ['Paradicsomos'])).toEqual(['Paradicsomos 2', 'Paradicsomos 3']);
  });

  it('egy darabnál a szabad nevet nem bántja, a foglaltat továbbszámozza', () => {
    expect(numberedNames('Fólia', 1, [])).toEqual(['Fólia']);
    expect(numberedNames('Fólia', 1, ['Fólia'])).toEqual(['Fólia 2']);
    expect(numberedNames('Emelt ágyás 1', 1, ['Emelt ágyás 1', 'Emelt ágyás 2'])).toEqual(['Emelt ágyás 3']);
  });

  it('a név utolsó számát lépteti, bárhol áll: sorszámnév ponttal, elöl, zárójel előtt', () => {
    expect(numberedNames('Emelt ágyás 7.', 2, ['Emelt ágyás 7.'])).toEqual(['Emelt ágyás 8.', 'Emelt ágyás 9.']);
    expect(numberedNames('1. ágyás', 2, ['1. ágyás'])).toEqual(['2. ágyás', '3. ágyás']);
    expect(numberedNames('Ágyás 1 (észak)', 1, ['Ágyás 1 (észak)'])).toEqual(['Ágyás 2 (észak)']);
  });

  it('a szó belsejében álló számot nem tekinti sorszámnak', () => {
    expect(numberedNames('E2E ágyás', 2, ['E2E ágyás'])).toEqual(['E2E ágyás 2', 'E2E ágyás 3']);
    expect(numberedNames('3x4 ágyás 1', 1, ['3x4 ágyás 1'])).toEqual(['3x4 ágyás 2']);
  });

  it('megtartja az elválasztót és a nullákkal kitöltött szélességet', () => {
    expect(numberedNames('Á-09', 3, ['Á-09'])).toEqual(['Á-10', 'Á-11', 'Á-12']);
    expect(numberedNames('E1', 2, ['E1'])).toEqual(['E2', 'E3']);
    expect(numberedNames('  Sor 5 ', 2, [])).toEqual(['Sor 5', 'Sor 6']);
  });

  it('nagyon hosszú sorszámnál is pontosan léptet, és nem akad el', () => {
    // 2^53 fölött a Number már nem tudna egyesével lépni: a foglalt név végtelen ciklust okozott
    expect(numberedNames('Ágyás 9007199254740992', 1, ['Ágyás 9007199254740992'])).toEqual(['Ágyás 9007199254740993']);
    expect(numberedNames('Ágyás 99999999999999999999', 3, [])).toEqual([
      'Ágyás 99999999999999999999',
      'Ágyás 100000000000000000000',
      'Ágyás 100000000000000000001',
    ]);
  });
});
