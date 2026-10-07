import { describe, expect, it } from 'vitest';
import { keyTarget, targetIndex, type RowBox } from './rowDrag.ts';

/** Egymás alatti, 44 képpontos sorok (közepük: 22, 66, 110, 154) */
const rows = (n: number, height = 44): RowBox[] => Array.from({ length: n }, (_, i) => ({ top: i * height, height }));

describe('targetIndex', () => {
  it('kis elmozdulásnál a sor a helyén marad', () => {
    expect(targetIndex(rows(4), 1, 0)).toBe(1);
    expect(targetIndex(rows(4), 1, 20)).toBe(1);
    expect(targetIndex(rows(4), 1, -20)).toBe(1);
  });

  it('lefelé húzva annyit lép, ahány sor közepén túljutott', () => {
    expect(targetIndex(rows(4), 0, 45)).toBe(1);
    expect(targetIndex(rows(4), 0, 89)).toBe(2);
    expect(targetIndex(rows(4), 1, 89)).toBe(3);
  });

  it('felfelé húzva annyit lép, ahány sor közepén túljutott', () => {
    expect(targetIndex(rows(4), 3, -45)).toBe(2);
    expect(targetIndex(rows(4), 3, -89)).toBe(1);
    expect(targetIndex(rows(4), 2, -89)).toBe(0);
  });

  it('pontosan a szomszéd közepén még egyik irányban sem cserélnek helyet', () => {
    expect(targetIndex(rows(3), 0, 44)).toBe(0);
    expect(targetIndex(rows(3), 2, -44)).toBe(2);
  });

  it('a lista végein túl húzva az első vagy az utolsó helyre kerül', () => {
    expect(targetIndex(rows(4), 1, 1000)).toBe(3);
    expect(targetIndex(rows(4), 2, -1000)).toBe(0);
  });

  it('eltérő magasságú soroknál (nyitott részletek) a közepekkel számol', () => {
    const boxes = [
      { top: 0, height: 44 },
      { top: 44, height: 160 },
      { top: 204, height: 44 },
    ];
    // a magas sor közepe 124: a 22-es közepű első sornak 102 képpontot kell lefelé jutnia
    expect(targetIndex(boxes, 0, 100)).toBe(0);
    expect(targetIndex(boxes, 0, 103)).toBe(1);
    expect(targetIndex(boxes, 2, -103)).toBe(1);
  });

  it('mérés nélküli sornál a helyén marad', () => {
    expect(targetIndex([undefined, { top: 44, height: 44 }], 0, 100)).toBe(0);
  });

  it('a nem mért szomszéd a húzott sorhoz képest a helyén marad', () => {
    const me = { top: 44, height: 44 };
    const below = { top: 88, height: 44 };
    expect(targetIndex([undefined, me, below], 1, 0)).toBe(1);
    expect(targetIndex([undefined, me, below], 1, 1000)).toBe(2);
    expect(targetIndex([undefined, me, below], 1, -1000)).toBe(1);
    expect(targetIndex([{ top: 0, height: 44 }, me, undefined], 1, 1000)).toBe(1);
    expect(targetIndex([{ top: 0, height: 44 }, me, undefined], 1, -1000)).toBe(0);
  });
});

describe('keyTarget', () => {
  it('a fel és le nyíl egy hellyel mozgat', () => {
    expect(keyTarget('ArrowUp', 2, 4)).toBe(1);
    expect(keyTarget('ArrowDown', 2, 4)).toBe(3);
  });

  it('a lista szélén a sor a helyén marad', () => {
    expect(keyTarget('ArrowUp', 0, 4)).toBe(0);
    expect(keyTarget('ArrowDown', 3, 4)).toBe(3);
  });

  it('más billentyű nem mozgat', () => {
    expect(keyTarget('Enter', 1, 4)).toBeNull();
    expect(keyTarget('ArrowLeft', 1, 4)).toBeNull();
  });
});
