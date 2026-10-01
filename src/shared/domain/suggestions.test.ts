import { describe, expect, it } from 'vitest';
import type { Bed, GrowingWindow, PlantListItem, PlantingListItem, SeedStockListItem } from '../types.ts';
import { companionIndex } from './companions.ts';
import type { ChecksContext } from './plantingChecks.ts';
import { blankPlanting } from './plantings.ts';
import { suggestPlantings, type SuggestionTarget } from './suggestions.ts';

const bed: Bed = {
  id: 1, garden_id: 1, name: 'A', color: 'green', length_cm: 200, width_cm: 100, row_direction: 'keresztben',
  pos_x_cm: null, pos_y_cm: null, rotation_deg: 0, bed_type: 'foldagyas', sun: null, soil: null, irrigation: null, notes: null,
  active_from_year: null, active_to_year: null, sort_order: 0,
} as Bed;

let windowId = 1;
const win = (w: Partial<GrowingWindow>): GrowingWindow => ({
  id: windowId++, plant_id: null, variety_id: null, season: 'tavaszi', method: 'helyrevetes',
  sow_start: null, sow_end: null, seedling_weeks: null, transplant_start: null, transplant_end: null,
  harvest_start: null, harvest_end: null, harvest_year_offset: 0, succession_days: null, notes: null, ...w,
});

const plant = (id: number, name_hu: string, p: Partial<PlantListItem>): PlantListItem => ({
  id, code: null, name_hu, name_latin: null, family_id: null, crop_group_id: null, rotation_stage: null, nutrient_group: 2,
  perennial: false, frost_sensitive: false, in_row_spacing_cm: 20, row_spacing_cm: 30, days_to_harvest: 60,
  harvest_duration_days: 30, seed_viability_years: 4, sun: null, aliases_en: [], notes: null, data_status: 'alapertek',
  source: null, family_name: null, crop_group_name: null, variety_count: 0, windows: [], ...p,
});

const paradicsom = plant(1, 'Paradicsom', {
  family_id: 1, rotation_stage: 'termes', nutrient_group: 1, frost_sensitive: true, row_spacing_cm: 80, days_to_harvest: 70,
  windows: [win({ method: 'palanta', sow_start: '03-01', sow_end: '04-10', seedling_weeks: 8, transplant_start: '05-10', transplant_end: '06-10' })],
});
const burgonya = plant(2, 'Burgonya', {
  family_id: 1, rotation_stage: 'gyoker', nutrient_group: 1, row_spacing_cm: 60,
  windows: [win({ method: 'ultetes', sow_start: '03-20', sow_end: '04-30' })],
});
const sargarepa = plant(3, 'Sárgarépa', {
  family_id: 2, rotation_stage: 'gyoker', nutrient_group: 2, row_spacing_cm: 25,
  windows: [win({ sow_start: '03-10', sow_end: '06-30' })],
});
const bab = plant(4, 'Bokorbab', {
  family_id: 3, rotation_stage: 'huvelyes', nutrient_group: 3, row_spacing_cm: 40, frost_sensitive: true,
  windows: [win({ sow_start: '05-01', sow_end: '07-15' })],
});
const retek = plant(5, 'Retek', {
  family_id: 4, rotation_stage: 'gyoker', row_spacing_cm: 15, days_to_harvest: 30,
  windows: [win({ sow_start: '03-01', sow_end: '04-15' })],
});
const plants = [paradicsom, burgonya, sargarepa, bab, retek];

const planting = (id: number, p: PlantListItem, over: Partial<PlantingListItem>): PlantingListItem => ({
  ...blankPlanting(), id, plant_id: p.id, plant_name: p.name_hu, family_id: p.family_id, rotation_stage: p.rotation_stage,
  nutrient_group: p.nutrient_group, perennial: p.perennial, bed_id: bed.id, method: 'helyrevetes', ...over,
});

const ctx = (all: PlantingListItem[], pairs: { a: number; b: number; relation: -1 | 0 | 1 }[] = []): ChecksContext => ({
  all,
  beds: [bed],
  families: new Map([
    [1, { name_hu: 'Burgonyafélék', rotation_gap_years: 3 }],
    [2, { name_hu: 'Ernyősök', rotation_gap_years: 3 }],
    [3, { name_hu: 'Pillangósok', rotation_gap_years: 3 }],
    [4, { name_hu: 'Káposztafélék', rotation_gap_years: 4 }],
  ]),
  companions: companionIndex(pairs.map((x) => ({ ...x, reason: null }))),
  frost: { lastFrost: '05-10', firstFrost: '10-20' },
  currentYear: 2026,
});

const target = (over: Partial<SuggestionTarget> = {}): SuggestionTarget => ({
  bed, year: 2027, strip: null, cross: null, from: '2027-01-01', today: '2026-10-01', ...over,
});
const names = (xs: { plant: PlantListItem }[]) => xs.map((s) => s.plant.name_hu);

describe('Mi kerülhet ide?', () => {
  it('tavalyi paradicsom után: a gyökérzöldség az első, a burgonyaféle kerülendő', () => {
    const history = [planting(10, paradicsom, { year: 2026, is_history: true, status: 'lezart' })];
    const out = suggestPlantings({ target: target(), plants, seeds: [], ctx: ctx(history) });
    // Az élen a gyökérzöldségek (a burgonya családja miatt kimarad közülük)
    expect(names(out.slice(0, 2)).sort()).toEqual(['Retek', 'Sárgarépa']);
    expect(out[0]!.reasons).toContainEqual(expect.objectContaining({ level: 'ok', text: 'Most gyökérzöldség következik' }));
    const krumpli = out.find((s) => s.plant.id === burgonya.id)!;
    expect(krumpli.rank).toBe('kerulendo');
    expect(krumpli.reasons.map((r) => r.text)).toContain('Családi szünet');
  });

  it('csak az időszakba és a szabad sávba illőt javasolja; ha kell, a hely felszabadulásáig vár', () => {
    // Az egész ágyást június végéig egy korábbi ültetés foglalja
    const busy = planting(11, sargarepa, {
      year: 2027, plan_sow_date: '2027-03-10', plan_end_date: '2027-06-30', axis_start_cm: 0, axis_span_cm: 200,
    });
    const out = suggestPlantings({ target: target(), plants, seeds: [], ctx: ctx([busy]) });
    expect(names(out)).not.toContain('Retek'); // a vetési időszaka április közepén véget ér
    const babSugg = out.find((s) => s.plant.id === bab.id)!;
    expect(babSugg.dates.sow).toBe('2027-06-30');
    expect(babSugg.reasons.map((r) => r.text)).toContain('Csak jún. 30. után szabad');
    // Keskeny sávba a 80 cm-es sortávú paradicsom nem fér
    const narrow = suggestPlantings({ target: target({ strip: { start: 0, span: 50 } }), plants, seeds: [], ctx: ctx([]) });
    expect(names(narrow)).not.toContain('Paradicsom');
    expect(narrow.find((s) => s.plant.id === sargarepa.id)!).toMatchObject({ rows: 2, placement: { axis_start_cm: 0, axis_span_cm: 50 } });
  });

  it('rossz szomszéd mellé nem ajánl; a készleten lévő vetőmagot választja', () => {
    const neighbour = planting(12, paradicsom, {
      year: 2027, method: 'vasarolt_palanta', plan_transplant_date: '2027-05-10', plan_end_date: '2027-10-01',
      axis_start_cm: 0, axis_span_cm: 80,
    });
    const seeds = [
      { id: 5, variety_id: 50, variety_name: 'Nantes', plant_id: sargarepa.id, plant_name: 'Sárgarépa', in_stock: true, vintage_year: 2026, seed_viability_years: 3 },
    ] as SeedStockListItem[];
    const out = suggestPlantings({
      target: target({ strip: { start: 80, span: 60 } }),
      plants,
      seeds,
      ctx: ctx([neighbour], [{ a: paradicsom.id, b: bab.id, relation: -1 }]),
    });
    expect(out.find((s) => s.plant.id === bab.id)).toMatchObject({ rank: 'kerulendo' });
    expect(out.find((s) => s.plant.id === sargarepa.id)).toMatchObject({ variety_id: 50, seed_stock_id: 5 });
  });

  it('ha a palántanevelés ideje elmúlt, vásárolt palántát javasol', () => {
    const out = suggestPlantings({ target: target({ year: 2026, from: '2026-05-01', today: '2026-05-01' }), plants: [paradicsom], seeds: [], ctx: ctx([]) });
    expect(out[0]).toMatchObject({ method: 'vasarolt_palanta', dates: { sow: null, transplant: '2026-05-10' } });
  });
});
