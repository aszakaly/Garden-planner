/**
 * Mintakert a Súgó képernyőképeihez és a bemutatóvideóhoz.
 * Egy üres (frissen seedelt) példányt tölt fel az API-n keresztül: hat ágyás az alaprajzon,
 * a 2026-os év lezárt ültetései, a 2027-es terv, vetőmagok és naplóbejegyzések.
 *
 * A `season` változat a 2027. május 10-i állapotot is beállítja (tény dátumok, elvégzett
 * feladatok, saját feladat), a kerti, telefonos jelenetekhez.
 *
 * Önálló futtatás (csak üres adatbázisra!):
 *   npx tsx scripts/sugo/mintakert.ts http://localhost:4361 [season]
 */
import { pathToFileURL } from 'node:url';
import { rowsForSpan } from '../../src/shared/domain/geometry.ts';

type Json = Record<string, unknown>;

async function call<T = Json>(api: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${api}/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

interface BedSpec {
  key: string;
  name: string;
  color: string;
  length_cm: number;
  width_cm: number;
  bed_type?: string;
  x: number;
  y: number;
  rot: 0 | 90;
}

const BEDS: BedSpec[] = [
  { key: 'a1', name: '1. ágyás', color: 'green', length_cm: 300, width_cm: 80, x: 40, y: 40, rot: 90 },
  { key: 'a2', name: '2. ágyás', color: 'orange', length_cm: 300, width_cm: 80, x: 160, y: 40, rot: 90 },
  { key: 'a3', name: '3. ágyás', color: 'blue', length_cm: 300, width_cm: 80, x: 280, y: 40, rot: 90 },
  { key: 'a4', name: '4. ágyás', color: 'purple', length_cm: 300, width_cm: 80, x: 400, y: 40, rot: 90 },
  { key: 'mag', name: 'Magaságyás', color: 'teal', length_cm: 200, width_cm: 100, bed_type: 'magasagyas', x: 540, y: 40, rot: 0 },
  { key: 'fu', name: 'Kiságyás', color: 'pink', length_cm: 150, width_cm: 80, x: 540, y: 200, rot: 0 },
];

interface PlantingSpec {
  bed: string;
  plant: string;
  variety?: string;
  method: 'helyrevetes' | 'palanta' | 'vasarolt_palanta' | 'ultetes';
  /** Sáv az ágyás hossza mentén (cm) */
  from: number;
  to: number;
  sow?: string;
  transplant?: string;
  harvest?: string;
  end: string;
}

/** 2026: lezárt év – a vetésforgó-ellenőrzés ebből dolgozik. */
const Y2026: PlantingSpec[] = [
  { bed: 'a1', plant: 'Burgonya', method: 'ultetes', from: 0, to: 300, sow: '2026-04-05', harvest: '2026-07-20', end: '2026-08-10' },
  { bed: 'a2', plant: 'Paradicsom', variety: 'Ökörszív', method: 'palanta', from: 0, to: 240, sow: '2026-03-01', transplant: '2026-05-12', harvest: '2026-07-15', end: '2026-10-05' },
  { bed: 'a2', plant: 'Bazsalikom', method: 'vasarolt_palanta', from: 240, to: 300, transplant: '2026-05-15', harvest: '2026-06-20', end: '2026-09-30' },
  { bed: 'a3', plant: 'Bokorbab', variety: 'Cherokee', method: 'helyrevetes', from: 0, to: 300, sow: '2026-05-05', harvest: '2026-07-10', end: '2026-08-15' },
  { bed: 'a4', plant: 'Sárgarépa', method: 'helyrevetes', from: 0, to: 150, sow: '2026-03-25', harvest: '2026-07-15', end: '2026-09-20' },
  { bed: 'a4', plant: 'Vöröshagyma', method: 'ultetes', from: 150, to: 300, sow: '2026-03-20', harvest: '2026-07-05', end: '2026-07-25' },
  { bed: 'mag', plant: 'Retek', method: 'helyrevetes', from: 0, to: 100, sow: '2026-03-15', harvest: '2026-04-15', end: '2026-04-30' },
  { bed: 'mag', plant: 'Saláta', method: 'vasarolt_palanta', from: 100, to: 200, transplant: '2026-04-05', harvest: '2026-05-10', end: '2026-06-10' },
  { bed: 'mag', plant: 'Uborka', method: 'helyrevetes', from: 0, to: 200, sow: '2026-05-20', harvest: '2026-07-10', end: '2026-09-01' },
  { bed: 'fu', plant: 'Petrezselyem', method: 'helyrevetes', from: 0, to: 75, sow: '2026-03-20', harvest: '2026-06-01', end: '2026-10-30' },
  { bed: 'fu', plant: 'Kapor', method: 'helyrevetes', from: 75, to: 150, sow: '2026-04-10', harvest: '2026-06-01', end: '2026-08-01' },
];

/**
 * 2027: a terv. Egyetlen szándékos hiba van benne: a paradicsom a tavalyi burgonya helyén
 * (ezen mutatjuk be a vetésforgó-figyelmeztetést). A 4. ágyás üres – ide kerül a bemutatott új
 * ültetés (bokorbab, a javaslatok élén), amely a `season` változatban már a terv része.
 */
const Y2027: PlantingSpec[] = [
  { bed: 'a1', plant: 'Paradicsom', variety: 'Ökörszív', method: 'palanta', from: 0, to: 240, sow: '2027-03-01', transplant: '2027-05-12', harvest: '2027-07-15', end: '2027-10-05' },
  { bed: 'a1', plant: 'Bazsalikom', method: 'vasarolt_palanta', from: 240, to: 300, transplant: '2027-05-15', harvest: '2027-06-20', end: '2027-09-30' },
  { bed: 'a2', plant: 'Sárgarépa', variety: 'Nantes', method: 'helyrevetes', from: 0, to: 300, sow: '2027-03-25', harvest: '2027-07-15', end: '2027-09-20' },
  { bed: 'a3', plant: 'Fejes káposzta', method: 'vasarolt_palanta', from: 0, to: 300, transplant: '2027-04-20', harvest: '2027-07-01', end: '2027-07-25' },
  { bed: 'mag', plant: 'Saláta', variety: 'Május királya', method: 'vasarolt_palanta', from: 0, to: 100, transplant: '2027-04-01', harvest: '2027-05-10', end: '2027-06-01' },
  { bed: 'mag', plant: 'Retek', variety: 'Jégcsap', method: 'helyrevetes', from: 100, to: 200, sow: '2027-03-10', harvest: '2027-04-15', end: '2027-04-25' },
  { bed: 'mag', plant: 'Cékla', method: 'helyrevetes', from: 100, to: 200, sow: '2027-05-05', harvest: '2027-07-20', end: '2027-08-31' },
  { bed: 'fu', plant: 'Paprika', variety: 'Kalocsai', method: 'palanta', from: 0, to: 75, sow: '2027-02-20', transplant: '2027-05-15', harvest: '2027-07-20', end: '2027-10-10' },
  { bed: 'fu', plant: 'Bazsalikom', method: 'vasarolt_palanta', from: 75, to: 150, transplant: '2027-05-15', harvest: '2027-06-20', end: '2027-09-30' },
];

/** A 4. ágyásba a tervezési jelenetben felvett ültetés; a szezonban már a terv része. */
const ADDED_IN_PLANNING: PlantingSpec = {
  bed: 'a4', plant: 'Bokorbab', variety: 'Cherokee', method: 'helyrevetes', from: 0, to: 300, sow: '2027-05-12', harvest: '2027-07-15', end: '2027-08-20',
};

/** Készleten lévő magok; ami nincs itt, abból Beszerzés feladat lesz (paprika, retek, cékla). */
const SEEDS = [
  { plant: 'Paradicsom', variety: 'Ökörszív', origin_type: 'sajat', vintage_year: 2026, quantity: 'kb. 40 szem' },
  { plant: 'Bokorbab', variety: 'Cherokee', origin_type: 'vasarolt', vintage_year: 2026, supplier: 'Gazdabolt', quantity: '1 csomag' },
  { plant: 'Sárgarépa', variety: 'Nantes', origin_type: 'vasarolt', vintage_year: 2026, supplier: 'Gazdabolt', quantity: '1 csomag' },
  { plant: 'Petrezselyem', variety: 'Félhosszú', origin_type: 'vasarolt', vintage_year: 2025, supplier: 'Gazdabolt', quantity: 'fél csomag' },
];

const JOURNAL = [
  { entry_date: '2026-06-12', entry_type: 'kartevo', bed: 'a1', plant: 'Burgonya', body: 'Burgonyabogár a levelek fonákján, kézzel összeszedve.' },
  { entry_date: '2026-07-18', entry_type: 'termes', bed: 'a2', plant: 'Paradicsom', body: 'Első szedés: édes, lédús, repedés nélkül.', amount: 2.5, unit: 'kg', quality: 5 },
  { entry_date: '2026-08-02', entry_type: 'megfigyeles', bed: 'mag', plant: 'Uborka', body: 'A magaságyásban gyorsan kiszárad, naponta kell locsolni.' },
];

export async function loadSampleGarden(api: string, opts: { season?: boolean } = {}) {
  const plants = await call<{ id: number; name_hu: string; row_spacing_cm: number | null }[]>(api, 'GET', '/plants');
  const plant = (name: string) => {
    const p = plants.find((x) => x.name_hu === name);
    if (!p) throw new Error(`Nincs ilyen növény a seedben: ${name}`);
    return p;
  };

  // Kert és ágyások az alaprajzon
  const [garden] = await call<{ id: number }[]>(api, 'GET', '/gardens');
  await call(api, 'PUT', `/gardens/${garden!.id}`, { name: 'Kertem', location: 'Budapest környéke', length_cm: 800, width_cm: 500 });
  const bedIds = new Map<string, number>();
  for (const [i, b] of BEDS.entries()) {
    const bed = await call<{ id: number }>(api, 'POST', '/beds', {
      garden_id: garden!.id,
      name: b.name,
      color: b.color,
      length_cm: b.length_cm,
      width_cm: b.width_cm,
      bed_type: b.bed_type ?? 'foldagyas',
      row_direction: 'keresztben',
      sun: 'napos',
      active_from_year: 2026,
      sort_order: i + 1,
    });
    bedIds.set(b.key, bed.id);
  }
  await call(api, 'PUT', `/gardens/${garden!.id}/layout`, {
    beds: BEDS.map((b) => ({ id: bedIds.get(b.key)!, pos_x_cm: b.x, pos_y_cm: b.y, rotation_deg: b.rot })),
  });

  // Vetőmagok (a fajták is itt jönnek létre)
  for (const s of SEEDS) {
    const { plant: name, variety, ...rest } = s;
    await call(api, 'POST', '/seeds', { plant_id: plant(name).id, variety_name: variety, ...rest });
  }
  const varieties = await call<{ id: number; plant_id: number; name: string }[]>(api, 'GET', '/varieties');
  async function varietyId(plantId: number, name?: string) {
    if (!name) return null;
    const v = varieties.find((x) => x.plant_id === plantId && x.name === name);
    if (v) return v.id;
    const created = await call<{ id: number; plant_id: number; name: string }>(api, 'POST', `/plants/${plantId}/varieties`, { name });
    varieties.push(created);
    return created.id;
  }

  // Ültetések
  const ids = new Map<string, number>();
  async function addPlanting(year: number, p: PlantingSpec) {
    const pl = plant(p.plant);
    const bed = BEDS.find((b) => b.key === p.bed)!;
    const span = p.to - p.from;
    const [created] = await call<{ id: number }[]>(api, 'POST', '/plantings', {
      year,
      plant_id: pl.id,
      variety_id: await varietyId(pl.id, p.variety),
      bed_id: bedIds.get(p.bed),
      axis_start_cm: p.from,
      axis_span_cm: span,
      cross_start_cm: 0,
      cross_span_cm: bed.width_cm,
      rows: rowsForSpan(span, pl.row_spacing_cm),
      method: p.method,
      plan_sow_date: p.sow ?? null,
      plan_transplant_date: p.transplant ?? null,
      plan_harvest_start: p.harvest ?? null,
      plan_end_date: p.end,
    });
    ids.set(`${year}:${p.bed}:${p.plant}`, created!.id);
    return created!.id;
  }
  for (const p of Y2026) {
    const id = await addPlanting(2026, p);
    await call(api, 'PATCH', `/plantings/${id}/actual`, {
      status: 'lezart',
      actual_sow_date: p.sow ?? null,
      actual_transplant_date: p.transplant ?? null,
      actual_harvest_start: p.harvest ?? null,
      actual_end_date: p.end,
    });
  }
  for (const p of opts.season ? [...Y2027, ADDED_IN_PLANNING] : Y2027) await addPlanting(2027, p);
  await call(api, 'PUT', '/plan-years/2026', { status: 'lezart', notes: null });
  await call(api, 'PUT', '/plan-years/2027', { status: 'tervezes', notes: null });

  for (const j of JOURNAL) {
    const { bed, plant: name, ...rest } = j;
    await call(api, 'POST', '/journal', {
      ...rest,
      bed_id: bedIds.get(bed),
      plant_id: plant(name).id,
      planting_id: ids.get(`2026:${bed}:${name}`) ?? null,
    });
  }

  if (opts.season) await applySeason(api, ids, bedIds);
}

/** A 2027. május 10-i állapot: ami eddig megtörtént, az rögzítve van. */
async function applySeason(api: string, ids: Map<string, number>, bedIds: Map<string, number>) {
  const id = (bed: string, plant: string) => ids.get(`2027:${bed}:${plant}`)!;
  const actual = (bed: string, plant: string, body: Json) => call(api, 'PATCH', `/plantings/${id(bed, plant)}/actual`, body);
  await call(api, 'PUT', '/plan-years/2027', { status: 'aktiv', notes: null });

  await actual('a1', 'Paradicsom', { actual_sow_date: '2027-03-02' });
  await actual('fu', 'Paprika', { actual_sow_date: '2027-02-22' });
  await actual('a2', 'Sárgarépa', { actual_sow_date: '2027-03-27' });
  await actual('a3', 'Fejes káposzta', { actual_transplant_date: '2027-04-22' });
  await actual('mag', 'Saláta', { actual_transplant_date: '2027-04-03' });
  await actual('mag', 'Retek', { actual_sow_date: '2027-03-12', actual_harvest_start: '2027-04-12', actual_end_date: '2027-04-26' });
  await actual('mag', 'Cékla', { actual_sow_date: '2027-05-06' });

  // A már elmúlt, nem dátumhoz kötött feladatok (beszerzés, szoktatás) elvégezve
  const tasks = await call<{ key: string; date: string; done_on: string | null; slot: string; title: string }[]>(
    api,
    'GET',
    '/tasks?from=2027-01-01&to=2027-05-09',
  );
  for (const t of tasks) {
    if (t.done_on || t.slot === 'sajat') continue;
    // A paprika szoktatása maradjon lejárt: ezen mutatjuk, mi a teendő a lemaradt feladattal
    if (t.slot === 'szoktatas' && t.title.startsWith('Paprika')) continue;
    if (t.slot === 'beszerzes' || t.slot === 'palanta_beszerzes' || t.slot === 'szoktatas') {
      await call(api, 'PATCH', `/tasks/${encodeURIComponent(t.key)}`, { done_on: t.date });
    }
  }

  await call(api, 'POST', '/custom-tasks', { title: 'Csigacsapdák kihelyezése', due_date: '2027-05-11', bed_id: bedIds.get('mag') });
  await call(api, 'POST', '/custom-tasks', { title: 'Paradicsomkarók beverése', due_date: '2027-05-11', bed_id: bedIds.get('a1') });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const api = process.argv[2] ?? 'http://localhost:4361';
  await loadSampleGarden(api, { season: process.argv[3] === 'season' });
  console.log('A mintakert betöltve:', api);
}
