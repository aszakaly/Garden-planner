import { describe, expect, it } from 'vitest';
import { seedViability } from './seeds.ts';

describe('seedViability', () => {
  it('évjárat + csírázóképességi idő alapján minősít', () => {
    // paradicsom: 4 év
    expect(seedViability(2024, 4, 2026)).toBe('ok');
    expect(seedViability(2022, 4, 2026)).toBe('utolso');
    expect(seedViability(2021, 4, 2026)).toBe('lejart');
  });

  it('hiányzó adatnál ismeretlen', () => {
    expect(seedViability(null, 4, 2026)).toBe('ismeretlen');
    expect(seedViability(2024, null, 2026)).toBe('ismeretlen');
  });

  it('egyéves csírázóképesség (pasztinák, hagyma)', () => {
    expect(seedViability(2025, 1, 2026)).toBe('utolso');
    expect(seedViability(2025, 1, 2027)).toBe('lejart');
  });
});
