import { describe, expect, it } from 'vitest';
import { withArticle, yearFrom, yearIn } from './text.ts';

describe('magyar toldalékok', () => {
  it('évszámok -ban/-ben és -tól/-től alakja', () => {
    expect([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2040, 2000, 2100].map(yearIn)).toEqual([
      '2020-ban', '2021-ben', '2022-ben', '2023-ban', '2024-ben', '2025-ben', '2026-ban', '2027-ben',
      '2028-ban', '2029-ben', '2030-ban', '2040-ben', '2000-ben', '2100-ban',
    ]);
    expect(yearFrom(2028)).toBe('2028-tól');
    expect(yearFrom(2029)).toBe('2029-től');
  });

  it('névelő', () => {
    expect(withArticle('uborka')).toBe('az uborka');
    expect(withArticle('retek', true)).toBe('A retek');
  });
});
