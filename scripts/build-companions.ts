/**
 * Egyszeri adatépítő: a Wind River Greens Plant Variety Database (CC BY 4.0)
 * fajtaszintű társítási adataiból faj szintű, a saját növényeinkhez rendelt
 * társítási táblát készít → seed/companions.json
 *
 * Futtatás:  npx tsx scripts/build-companions.ts
 *
 * Forrás: https://github.com/bripatch/plant-variety-database  (plants.windrivergreens.com)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'scripts', '.cache');
const RAW = 'https://raw.githubusercontent.com/bripatch/plant-variety-database/main/data';

interface SeedPlant {
  code: string;
  name_hu: string;
  aliases_en: string[];
  latin_patterns: string[];
}

/** Gyűjtőnevek → a hozzájuk tartozó saját növénykódok. Ezek felülírják a növények aliasait. */
const GROUP_ALIASES: Record<string, string[]> = {
  brassicas: ['fejes_kaposzta', 'kelkaposzta', 'karfiol', 'brokkoli', 'karalabe', 'kelbimbo', 'fodros_kel'],
  brassica: ['fejes_kaposzta', 'kelkaposzta', 'karfiol', 'brokkoli', 'karalabe', 'kelbimbo', 'fodros_kel'],
  'cabbage family': ['fejes_kaposzta', 'kelkaposzta', 'karfiol', 'brokkoli', 'karalabe', 'kelbimbo', 'fodros_kel'],
  'cole crops': ['fejes_kaposzta', 'kelkaposzta', 'karfiol', 'brokkoli', 'karalabe', 'kelbimbo', 'fodros_kel'],
  alliums: ['voroshagyma', 'fokhagyma', 'porehagyma', 'metelohagyma', 'mogyorohagyma'],
  allium: ['voroshagyma', 'fokhagyma', 'porehagyma', 'metelohagyma', 'mogyorohagyma'],
  'onion family': ['voroshagyma', 'fokhagyma', 'porehagyma', 'metelohagyma', 'mogyorohagyma'],
  'onions and garlic': ['voroshagyma', 'fokhagyma'],
  nightshades: ['paradicsom', 'paprika', 'padlizsan', 'burgonya'],
  'nightshade family': ['paradicsom', 'paprika', 'padlizsan', 'burgonya'],
  cucurbits: ['uborka', 'cukkini', 'patisszon', 'sutotok', 'gorogdinnye', 'sargadinnye'],
  'squash family': ['uborka', 'cukkini', 'patisszon', 'sutotok', 'gorogdinnye', 'sargadinnye'],
  squash: ['cukkini', 'patisszon', 'sutotok'],
  squashes: ['cukkini', 'patisszon', 'sutotok'],
  legumes: ['bokorbab', 'futobab', 'zoldborso'],
  'beans and peas': ['bokorbab', 'futobab', 'zoldborso'],
  'peas and beans': ['bokorbab', 'futobab', 'zoldborso'],
};

// ---------------------------------------------------------------------------
// Magyar indoklás: a forrás szabad szöveges angol indoklásából kulcsszavak alapján
// rövid, egységes magyar mondat. Az eredeti szöveg az `evidence.eredeti` mezőben megmarad.

const PESTS: [RegExp, string][] = [
  [/aphid/, 'levéltetvek'],
  [/whitefl/, 'molytetvek'],
  [/flea beetle/, 'földibolhák'],
  [/cabbage (worm|moth|looper|butterfl)|cabbageworm|imported cabbage/, 'káposztalepke-hernyók'],
  [/cabbage (root )?fl(y|ies)|root maggot/, 'káposztalégy'],
  [/carrot (rust )?fl(y|ies)/, 'répalégy'],
  [/onion (fl(y|ies)|maggot)/, 'hagymalégy'],
  [/nematode/, 'fonálférgek'],
  [/hornworm/, 'dohányszender-hernyók'],
  [/cucumber beetle/, 'uborkabogarak'],
  [/squash bug/, 'tökpoloskák'],
  [/squash vine borer|vine borer/, 'tökfúró lepke'],
  [/spider mite|\bmites?\b/, 'takácsatkák'],
  [/thrips/, 'tripszek'],
  [/japanese beetle/, 'japán cserebogár'],
  [/(colorado )?potato beetle/, 'burgonyabogár'],
  [/bean beetle/, 'babbogarak'],
  [/asparagus beetle/, 'spárgabogár'],
  [/slug|snail/, 'csigák'],
  [/\bants?\b/, 'hangyák'],
  [/mosquito/, 'szúnyogok'],
  [/earworm|fruitworm/, 'gyapottok-bagolylepke'],
  [/cutworm/, 'lombbagoly-hernyók'],
  [/leaf ?miner/, 'aknázólegyek'],
  [/stink bug/, 'poloskák'],
  [/rodent|mice|\bmoles?\b|voles?/, 'rágcsálók'],
  [/deer/, 'őzek'],
  [/rabbit/, 'nyulak'],
  [/weevil/, 'ormányosbogarak'],
  [/codling moth/, 'almamoly'],
  [/tomato fruitworm/, 'gyapottok-bagolylepke'],
];

function pestsIn(text: string): string[] {
  const found = PESTS.filter(([re]) => re.test(text)).map(([, hu]) => hu);
  return [...new Set(found)];
}

function hungarianReason(en: string | null, relation: number): string {
  if (!en) return relation === 0 ? 'A források ellentmondanak – semlegesként kezelve.' : '';
  const t = en.toLowerCase();
  const parts: string[] = [];

  if (relation >= 0) {
    if (/trap crop|sacrificial|lures? .* away|draws? .* away/.test(t)) {
      parts.push('Csapdanövény: magára vonzza a kártevőket');
    }
    if (/repel|deter|mask|confus|keeps? .* away|pest control|pest deterrent|protects? (\w+ )*(from|against)/.test(t)) {
      const pests = pestsIn(t);
      parts.push(pests.length ? `Riasztja a kártevőket (${pests.join(', ')})` : 'Riasztja a kártevőket');
    }
    if (/pollinator|bees\b/.test(t)) parts.push('Beporzókat vonz');
    if (/beneficial (insect|wasp|predator)|hoverfl|parasitic wasp|ladybug|lacewing|predatory/.test(t)) {
      parts.push('Hasznos rovarokat vonz');
    }
    if (/nitrogen/.test(t) && !/inhibit|compet|excess/.test(t)) parts.push('Nitrogént köt a talajba');
    if (/flavou?r|taste/.test(t)) parts.push('Javíthatja az ízét');
    if (/three sisters/.test(t)) parts.push('A hagyományos „három nővér” társítás része');
    if (/trellis|support|climb/.test(t)) parts.push('Támasztékot ad a kúszónövénynek');
    if (/windbreak|wind protection/.test(t)) parts.push('Szélfogóként véd');
    if (/(provides?|offers?|gives?|casts?) (partial |light |natural )?shade|benefits? from .*shade/.test(t)) {
      parts.push('Részleges árnyékot ad');
    }
    if (/ground cover|living mulch|suppress(es)? weeds|retain(s)? (soil )?moisture/.test(t)) {
      parts.push('Talajt takar, megőrzi a nedvességet');
    }
    if (/break(s)? up|loosen|different (root|rooting)|root depth|shallow.*deep|deep.*shallow/.test(t)) {
      parts.push('Eltérő gyökérzóna, lazítja a talajt');
    }
    if (/(mature|harvest)(s)? (quickly|early|before)|succession|interplant|intercrop/.test(t)) {
      parts.push('Gyorsan lekerül, jó köztes növény');
    }
    if (/fung|disease|blight|mildew|damping/.test(t)) parts.push('Segíthet a betegségek megelőzésében');
    if (/soil health|improv(es|ing) (the )?soil/.test(t)) parts.push('Javítja a talaj állapotát');
    if (!parts.length && /similar|compatible|same|share|both/.test(t)) {
      parts.push('Hasonló igények, jól megférnek egymás mellett');
    }
    if (!parts.length && /growth|vigor|health/.test(t)) parts.push('Serkentheti a növekedését');
  }

  if (relation <= 0) {
    if (/inhibit.*nitrogen fixation|nitrogen fixation.*inhibit|rhizobia/.test(t)) {
      parts.push('A hagymafélék gátolják a hüvelyesek nitrogénkötését');
    }
    if (/allelopath|juglone|chemical/.test(t)) parts.push('Gátló anyagokat választ ki (allelopátia)');
    else if (/inhibit|stunt|suppress|retard/.test(t)) parts.push('Visszavetheti a növekedését');
    if (/compet/.test(t) || /heavy feeder/.test(t)) {
      const what: string[] = [];
      if (/nutrient|feeder|nitrogen/.test(t)) what.push('tápanyagért');
      if (/space|root/.test(t)) what.push('helyért');
      if (/water|moisture/.test(t)) what.push('vízért');
      if (/light|sun/.test(t)) what.push('fényért');
      parts.push(`Versenyeznek a ${what.length ? what.join(' és ') : 'tápanyagért'}`);
    }
    if (/same family|similar pests|same pests|share|attract(s)? (the )?(same|similar)|harbou?r|disease|blight|clubroot|pathogen|wilt|virus/.test(t)) {
      const pests = pestsIn(t);
      parts.push(`Közös kártevők és betegségek${pests.length ? ` (${pests.join(', ')})` : ''}`);
    }
    if (/shade|tall|overshadow/.test(t)) parts.push('Túlságosan beárnyékolja');
    if (/cross[- ]pollinat/.test(t)) parts.push('Keresztbeporzódhatnak');
    if (/aggressive|spread|overwhelm|overtake|invasive/.test(t)) parts.push('Erősen terjed, elnyomja');
    if (/different (water|soil|growing)|prefers? dry|needs? (consistent|more) (moisture|water)|opposite/.test(t)) {
      parts.push('Eltérő víz- és talajigény');
    }
    if (/excessive leaf|excess nitrogen|too much nitrogen/.test(t)) {
      parts.push('A sok nitrogén a gyökér helyett a lombot növeli');
    }
  }

  if (!parts.length) {
    return relation > 0 ? 'Kedvező szomszédok (a forrás szerint).' : 'Kerülendő szomszédság (a forrás szerint).';
  }
  const unique = [...new Set(parts)].map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1)));
  const sentence = unique.join('; ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

// ---------------------------------------------------------------------------

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.length > 1);
  return data.map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ''])));
}

async function loadCsv(name: string): Promise<Record<string, string>[]> {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, `${name}.csv`);
  if (!existsSync(path)) {
    const res = await fetch(`${RAW}/${name}.csv`);
    if (!res.ok) throw new Error(`Letöltési hiba: ${name}.csv (${res.status})`);
    writeFileSync(path, await res.text());
  }
  return parseCsv(readFileSync(path, 'utf8'));
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singular(name: string): string {
  if (name.endsWith('ies')) return `${name.slice(0, -3)}y`;
  if (name.endsWith('oes')) return name.slice(0, -2);
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
  return name;
}

// ---------------------------------------------------------------------------

const plants: SeedPlant[] = JSON.parse(readFileSync(join(ROOT, 'seed', 'plants.hu.json'), 'utf8'));
const varieties = await loadCsv('varieties');
const companions = await loadCsv('companion_plants');

// Alany: fajta → saját növény(ek) a tudományos név alapján
const patterns = plants.map((p) => ({ code: p.code, res: p.latin_patterns.map((s) => new RegExp(s)) }));
const subjectByVariety = new Map<string, string[]>();
for (const v of varieties) {
  const latin = v.scientific_name!.trim();
  const codes = patterns.filter((p) => p.res.some((re) => re.test(latin))).map((p) => p.code);
  if (codes.length) subjectByVariety.set(v.id!, codes);
}

// Tárgy: szabad szöveges társnév → saját növény(ek)
const aliasMap = new Map<string, Set<string>>();
for (const p of plants) {
  for (const alias of [...p.aliases_en, p.code]) {
    const key = normalizeName(alias);
    if (!aliasMap.has(key)) aliasMap.set(key, new Set());
    aliasMap.get(key)!.add(p.code);
  }
}
for (const [alias, codes] of Object.entries(GROUP_ALIASES)) aliasMap.set(alias, new Set(codes));

function resolveCompanion(name: string): string[] {
  const n = normalizeName(name);
  for (const key of [n, singular(n)]) {
    const hit = aliasMap.get(key);
    if (hit) return [...hit];
  }
  return [];
}

// Összesítés fajpáronként
interface PairStats {
  kedvezo: number;
  kerulendo: number;
  reasons: { kedvezo: Map<string, number>; kerulendo: Map<string, number> };
}
const pairs = new Map<string, PairStats>();
const unmatched = new Map<string, number>();
let usedRows = 0;

for (const row of companions) {
  const subjects = subjectByVariety.get(row.variety_id!);
  if (!subjects) continue;
  const objects = resolveCompanion(row.companion_name!);
  if (!objects.length) {
    const n = normalizeName(row.companion_name!);
    unmatched.set(n, (unmatched.get(n) ?? 0) + 1);
    continue;
  }
  const kind = row.relationship === 'harmful' ? 'kerulendo' : 'kedvezo';
  usedRows++;
  for (const s of subjects) {
    for (const o of objects) {
      if (s === o) continue;
      const key = [s, o].sort().join('|');
      let stats = pairs.get(key);
      if (!stats) {
        stats = { kedvezo: 0, kerulendo: 0, reasons: { kedvezo: new Map(), kerulendo: new Map() } };
        pairs.set(key, stats);
      }
      stats[kind]++;
      const reason = row.reason!.trim();
      if (reason) stats.reasons[kind].set(reason, (stats.reasons[kind].get(reason) ?? 0) + 1);
    }
  }
}

// Döntés: egyértelmű többség (≥ 75%) → kedvező/kerülendő, különben semleges (ellentmondó)
const translationsPath = join(ROOT, 'seed', 'companion-reasons.hu.json');
const translations: Record<string, string> = existsSync(translationsPath)
  ? JSON.parse(readFileSync(translationsPath, 'utf8'))
  : {};

const out = [...pairs.entries()]
  .map(([key, s]) => {
    const [a, b] = key.split('|') as [string, string];
    const total = s.kedvezo + s.kerulendo;
    const relation = s.kedvezo / total >= 0.75 ? 1 : s.kerulendo / total >= 0.75 ? -1 : 0;
    const bucket = relation === -1 ? s.reasons.kerulendo : s.reasons.kedvezo;
    const reason_en =
      relation === 0
        ? null
        : ([...bucket.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null);
    return {
      a,
      b,
      relation,
      reason_hu: translations[key] ?? hungarianReason(reason_en, relation),
      evidence: { kedvezo: s.kedvezo, kerulendo: s.kerulendo, eredeti: reason_en },
    };
  })
  .sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b));

writeFileSync(join(ROOT, 'seed', 'companions.json'), `${JSON.stringify(out, null, 1)}\n`);

// Jelentés
const count = (r: number) => out.filter((p) => p.relation === r).length;
console.log(`Felhasznált sorok: ${usedRows} / ${companions.length}`);
console.log(`Fajpárok: ${out.length}  (kedvező ${count(1)}, kerülendő ${count(-1)}, ellentmondó ${count(0)})`);
const generic = out.filter((p) => p.reason_hu.includes('(a forrás szerint)')).length;
console.log(`Általános (kulcsszó nélküli) magyar indoklás: ${generic}`);
console.log('\nLeggyakoribb azonosítatlan társnevek:');
for (const [name, n] of [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  console.log(`  ${n.toString().padStart(4)}  ${name}`);
}
