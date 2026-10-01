import { describe, expect, it } from 'vitest';
import { bedRotationSummary, rotationIssues, type FamilyInfo, type RotationCrop } from './rotation.ts';

const families = new Map<number, FamilyInfo>([
  [1, { name_hu: 'Burgonyafélék', rotation_gap_years: 3 }],
  [2, { name_hu: 'Káposztafélék', rotation_gap_years: 4 }],
  [3, { name_hu: 'Pillangósvirágúak (hüvelyesek)', rotation_gap_years: 4 }],
  [4, { name_hu: 'Ernyősvirágzatúak', rotation_gap_years: 3 }],
]);

let nextId = 1;
const crop = (c: Partial<RotationCrop> & Pick<RotationCrop, 'year' | 'plant_name'>): RotationCrop => ({
  id: nextId++, plant_id: 0, family_id: null, rotation_stage: null, nutrient_group: null,
  perennial: false, series_id: null, period: null, confirmed: true, ...c,
});
const tomato = (year: number, extra: Partial<RotationCrop> = {}) =>
  crop({ year, plant_name: 'Paradicsom', plant_id: 1, family_id: 1, rotation_stage: 'termes', nutrient_group: 1, ...extra });
const potato = (year: number) => crop({ year, plant_name: 'Burgonya', plant_id: 2, family_id: 1, rotation_stage: 'gyoker', nutrient_group: 1 });
const bean = (year: number) => crop({ year, plant_name: 'Bokorbab', plant_id: 3, family_id: 3, rotation_stage: 'huvelyes', nutrient_group: 3 });
const carrot = (year: number, extra: Partial<RotationCrop> = {}) =>
  crop({ year, plant_name: 'Sárgarépa', plant_id: 4, family_id: 4, rotation_stage: 'gyoker', nutrient_group: 2, ...extra });
const cabbage = (year: number, extra: Partial<RotationCrop> = {}) =>
  crop({ year, plant_name: 'Karalábé', plant_id: 5, family_id: 2, rotation_stage: 'level', nutrient_group: 2, ...extra });
const radish = (year: number, extra: Partial<RotationCrop> = {}) =>
  crop({ year, plant_name: 'Retek', plant_id: 6, family_id: 2, rotation_stage: 'gyoker', nutrient_group: 2, ...extra });

const codes = (c: RotationCrop, h: RotationCrop[]) => rotationIssues(c, h, families, 2027).map((i) => [i.code, i.level]);

describe('vetésforgó', () => {
  it('ugyanaz a növény tavaly: kerülendő; erős után erős is jelezve', () => {
    const issues = rotationIssues(tomato(2027), [tomato(2026)], families, 2027);
    expect(issues.map((i) => [i.code, i.level])).toEqual([
      ['ugyanaz', 'kerulendo'],
      ['tapanyag', 'figyelem'],
    ]);
    expect(issues[0]!.message).toBe(
      'Paradicsom 2026-ban is itt volt – ugyanaz a növény két egymást követő évben ne kerüljön ugyanoda.',
    );
  });

  it('burgonyafélék után burgonyafélék a szünet letelte előtt', () => {
    expect(codes(tomato(2027), [potato(2026)])).toEqual([
      ['csalad', 'kerulendo'],
      ['tapanyag', 'figyelem'],
      ['szakasz_kimarad', 'info'],
    ]);
    const twoYears = rotationIssues(tomato(2027), [potato(2025)], families, 2027);
    expect(twoYears.map((i) => [i.code, i.level])).toEqual([['csalad', 'figyelem']]);
    expect(twoYears[0]!.message).toBe(
      'Burgonyafélék: legalább 3 évnek kell eltelnie, mielőtt ugyanoda kerülnek – 2025-ben burgonya volt itt (2028-tól lehet újra).',
    );
    expect(codes(tomato(2027), [potato(2024)])).toEqual([]);
  });

  it('a tény felülírja a tervet: a megerősítetlen múltbeli terv jelölve', () => {
    const [issue] = rotationIssues(tomato(2027), [potato(2025)].map((p) => ({ ...p, confirmed: false })), families, 2027);
    expect(issue!.message).toContain('2025-ben (a terv szerint) burgonya');
  });

  it('vetésforgó-szakasz: hüvelyes után levél rendben, ismétlődés és kihagyás jelezve', () => {
    expect(codes(cabbage(2027), [bean(2026)])).toEqual([]);
    expect(codes(carrot(2027), [bean(2026)])).toEqual([['szakasz_kimarad', 'info']]);
    expect(codes(carrot(2027), [radish(2026)])).toEqual([['szakasz', 'figyelem']]);
    expect(rotationIssues(carrot(2027), [bean(2026)], families, 2027)[0]!.message).toBe(
      'A klasszikus sorrendben (hüvelyes → levél → termés → gyökér) hüvelyes után levélzöldség következne.',
    );
  });

  it('éven belüli utóvetemény ugyanabból a családból; a saját sorozat nem számít', () => {
    const spring = radish(2027, { period: { start: '2027-03-01', end: '2027-04-13' }, series_id: 's1' });
    const summer = cabbage(2027, { period: { start: '2027-05-01', end: '2027-07-01' } });
    expect(codes(summer, [spring])).toEqual([['utovetemeny', 'figyelem']]);
    expect(rotationIssues(summer, [spring], families, 2027)[0]!.message).toBe(
      'Káposztafélék egymás után ugyanabban az évben (retek → karalábé): a kártevők és betegségek felhalmozódhatnak.',
    );
    const second = radish(2027, { period: { start: '2027-04-13', end: '2027-05-20' }, series_id: 's1' });
    expect(codes(second, [spring])).toEqual([]);
  });

  it('évelő növényt nem ellenőriz', () => {
    expect(codes(crop({ year: 2027, plant_name: 'Eper', perennial: true, family_id: 1 }), [potato(2026)])).toEqual([]);
  });
});

describe('ágyás-összegzés', () => {
  it('javasolt következő szakasz és a még kerülendő családok', () => {
    const s = bedRotationSummary([potato(2024), bean(2025), tomato(2026)], 2027, families);
    expect(s.last).toEqual({ year: 2026, stages: ['termes'] });
    expect(s.next).toBe('gyoker');
    expect(s.blocked.map((b) => [b.name, b.from])).toEqual([
      ['Burgonyafélék', 2029],
      ['Pillangósvirágúak (hüvelyesek)', 2029],
    ]);
  });

  it('vegyes előző évnél nincs egyértelmű javaslat', () => {
    expect(bedRotationSummary([tomato(2026), bean(2026)], 2027, families).next).toBeNull();
    expect(bedRotationSummary([], 2027, families)).toEqual({ last: null, next: null, blocked: [] });
  });
});
