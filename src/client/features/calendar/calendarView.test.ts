import { describe, expect, it } from 'vitest';
import { daysInMonth, monthGrid, shiftMonth, weekdayIndex } from './calendarView.ts';

describe('naptár-rács', () => {
  it('hétfővel kezdődő teljes hetek', () => {
    // 2026. október 1. csütörtök
    const grid = monthGrid('2026-10');
    expect(weekdayIndex('2026-10-01')).toBe(3);
    expect(grid[0]).toBe('2026-09-28');
    expect(grid.at(-1)).toBe('2026-11-01');
    expect(grid).toHaveLength(35);
  });

  it('hat hetes hónap és szökőév', () => {
    expect(monthGrid('2026-03')).toHaveLength(42); // márc. 1. vasárnap
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2027-02')).toBe(28);
  });

  it('hónap léptetése évhatáron át', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-05', -17)).toBe('2024-12');
  });
});
