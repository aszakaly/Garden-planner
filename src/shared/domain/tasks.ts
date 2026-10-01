import type { PlantingMethod, PlantingStatus } from '../labels.ts';
import { capitalize } from '../text.ts';
import type { Bed, PlantingListItem } from '../types.ts';
import { bedStart, DATE_FIELDS, usesSow, usesTransplant, type DateField, type PlantingDates } from './dates.ts';
import { placementsOverlap } from './geometry.ts';
import { addDaysISO, diffDays, minISO, shortDate } from './isoDate.ts';
import { effectiveBedId, effectiveDates, placementOf } from './plantings.ts';

/**
 * Feladatok: a tervből determinisztikusan generált teendők és a saját feladatok.
 * A generált feladat kulcsa stabil (pl. `vetes:12`), így a terv módosítása után is
 * megmarad az állapota (áthelyezés, megjegyzés).
 */

/** Generált feladattípusok az ültetés menetének sorrendjében. */
export const TASK_SLOTS = ['beszerzes', 'palanta_beszerzes', 'vetes', 'szoktatas', 'kiultetes', 'betakaritas', 'felszabadul'] as const;
export type TaskSlot = (typeof TASK_SLOTS)[number];

/** Csoportosítás a szűréshez és a színekhez. */
export const TASK_CATEGORIES = ['beszerzes', 'vetes', 'kiultetes', 'betakaritas', 'felszabadul', 'sajat'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  beszerzes: 'Beszerzés',
  vetes: 'Vetés, ültetés',
  kiultetes: 'Palánta, kiültetés',
  betakaritas: 'Betakarítás',
  felszabadul: 'Terület felszabadul',
  sajat: 'Saját feladat',
};

const SLOT_CATEGORY: Record<TaskSlot, TaskCategory> = {
  beszerzes: 'beszerzes',
  palanta_beszerzes: 'beszerzes',
  vetes: 'vetes',
  szoktatas: 'kiultetes',
  kiultetes: 'kiultetes',
  betakaritas: 'betakaritas',
  felszabadul: 'felszabadul',
};

/** Az ültetés dátummezője, amelyet a feladat elvégzése kitölt (tény dátum). */
export const SLOT_FIELD: Partial<Record<TaskSlot, DateField>> = {
  vetes: 'sow',
  kiultetes: 'transplant',
  betakaritas: 'harvestStart',
  felszabadul: 'end',
};
const FIELD_SLOT: Record<DateField, TaskSlot> = { sow: 'vetes', transplant: 'kiultetes', harvestStart: 'betakaritas', end: 'felszabadul' };

export const ACTUAL_COLUMN: Record<DateField, 'actual_sow_date' | 'actual_transplant_date' | 'actual_harvest_start' | 'actual_end_date'> = {
  sow: 'actual_sow_date',
  transplant: 'actual_transplant_date',
  harvestStart: 'actual_harvest_start',
  end: 'actual_end_date',
};

/** A vetőmagot ennyi nappal az első vetés előtt érdemes beszerezni. */
export const SEED_LEAD_DAYS = 21;
/** A palánták szoktatása ennyi nappal a kiültetés előtt kezdődik. */
export const HARDENING_DAYS = 7;
/** A vásárolt palántát ennyi nappal a kiültetés előtt érdemes megvenni. */
export const SEEDLING_PURCHASE_DAYS = 3;

export interface TaskState {
  task_key: string;
  done_at: string | null;
  moved_to: string | null;
  note: string | null;
}

export interface TaskItem {
  key: string;
  slot: TaskSlot | 'sajat';
  category: TaskCategory;
  /** Rövid típusfelirat (címke) */
  label: string;
  title: string;
  /** A megjelenítés napja: elvégzett, tény dátumhoz kötött feladatnál a tényleges nap, egyébként a várható (vagy áthelyezett) nap */
  date: string;
  /** A terv szerinti nap (generált feladatnál) */
  planned: string | null;
  /** Kézzel áthelyezett nap */
  moved_to: string | null;
  /** Elvégezve (nap), egyébként null */
  done_on: string | null;
  year: number;
  planting_id: number | null;
  /** Beszerzésnél az összes érintett ültetés */
  planting_ids: number[];
  bed_id: number | null;
  bed_name: string | null;
  bed_color: string | null;
  /** Másodlagos sor: fajta, mennyiség, sorozat, … */
  detail: string;
  note: string | null;
  /** Saját feladatnál a rekord azonosítója */
  custom_id: number | null;
}

// --- Kulcsok -------------------------------------------------------------------

export const taskKey = (slot: Exclude<TaskSlot, 'beszerzes'>, plantingId: number) => `${slot}:${plantingId}`;
export const purchaseKey = (year: number, varietyId: number | null, plantId: number) =>
  `beszerzes:${year}:${varietyId ? `v${varietyId}` : `p${plantId}`}`;
export const customKey = (id: number) => `sajat:${id}`;

export type ParsedTaskKey =
  | { slot: 'beszerzes'; year: number; varietyId: number | null; plantId: number | null }
  | { slot: Exclude<TaskSlot, 'beszerzes'>; plantingId: number }
  | { slot: 'sajat'; customId: number };

export function parseTaskKey(key: string): ParsedTaskKey | null {
  const purchase = /^beszerzes:(\d{4}):([vp])(\d+)$/.exec(key);
  if (purchase) {
    const id = Number(purchase[3]);
    return { slot: 'beszerzes', year: Number(purchase[1]), varietyId: purchase[2] === 'v' ? id : null, plantId: purchase[2] === 'p' ? id : null };
  }
  const custom = /^sajat:(\d+)$/.exec(key);
  if (custom) return { slot: 'sajat', customId: Number(custom[1]) };
  const m = /^([a-z_]+):(\d+)$/.exec(key);
  if (m && (TASK_SLOTS as readonly string[]).includes(m[1]!) && m[1] !== 'beszerzes') {
    return { slot: m[1] as Exclude<TaskSlot, 'beszerzes'>, plantingId: Number(m[2]) };
  }
  return null;
}

// --- Dátumok -------------------------------------------------------------------

type Timed = Pick<
  PlantingListItem,
  | 'plan_sow_date'
  | 'plan_transplant_date'
  | 'plan_harvest_start'
  | 'plan_end_date'
  | 'actual_sow_date'
  | 'actual_transplant_date'
  | 'actual_harvest_start'
  | 'actual_end_date'
>;

const PLAN_COLUMN: Record<DateField, keyof Timed> = {
  sow: 'plan_sow_date',
  transplant: 'plan_transplant_date',
  harvestStart: 'plan_harvest_start',
  end: 'plan_end_date',
};

/**
 * Várható dátumok: a tény dátum, ha megvan; a kézzel áthelyezett nap; különben a terv.
 * Ha egy korábbi lépés a tervhez képest csúszott, a későbbi (még nem teljesült)
 * lépések ugyanannyival csúsznak – a terv maga változatlan marad.
 */
export function expectedDates(p: Timed, moved: Partial<Record<DateField, string | null>> = {}): PlantingDates {
  const out: PlantingDates = { sow: null, transplant: null, harvestStart: null, end: null };
  let delta = 0;
  for (const f of DATE_FIELDS) {
    const plan = p[PLAN_COLUMN[f]];
    const fixed = p[ACTUAL_COLUMN[f]] ?? moved[f] ?? null;
    if (fixed) {
      out[f] = fixed;
      if (plan) delta = diffDays(plan, fixed);
    } else if (plan) {
      out[f] = delta ? addDaysISO(plan, delta) : plan;
    }
  }
  return out;
}

/** Az ültetés státusza a tény dátumok alapján (az elmaradt / sikertelen nem változik). */
export function statusFromActuals(status: PlantingStatus, actual: PlantingDates): PlantingStatus {
  if (status === 'elmaradt' || status === 'sikertelen') return status;
  if (actual.end) return 'lezart';
  if (actual.sow || actual.transplant || actual.harvestStart) return 'folyamatban';
  return 'terv';
}

// --- Generálás -----------------------------------------------------------------

export interface TaskInput {
  plantings: PlantingListItem[];
  states: Map<string, TaskState>;
  beds: Map<number, Bed>;
}

const lower = (s: string) => s.toLocaleLowerCase('hu');
const methodOf = (p: PlantingListItem): PlantingMethod => p.method ?? 'helyrevetes';
const needsSeed = (m: PlantingMethod) => m !== 'vasarolt_palanta';
const withVariety = (p: PlantingListItem) => (p.variety_name ? `${lower(p.plant_name)} (${p.variety_name})` : lower(p.plant_name));

function amount(p: PlantingListItem): string | null {
  const parts = [p.rows ? `${p.rows} sor` : null, p.plant_count ? `${p.plant_count} tő` : null].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

const SLOT_ORDER: Record<TaskSlot, number> = Object.fromEntries(TASK_SLOTS.map((s, i) => [s, i])) as Record<TaskSlot, number>;

/** Az ültetés helyére következő ültetés (a terület felszabadulásakor hasznos tudni). */
function nextOccupant(p: PlantingListItem, end: string, all: PlantingListItem[], beds: Map<number, Bed>): PlantingListItem | null {
  const bedId = effectiveBedId(p);
  const bed = bedId != null ? beds.get(bedId) : undefined;
  if (!bed) return null;
  const mine = placementOf(p, bed);
  let best: { p: PlantingListItem; start: string } | null = null;
  for (const q of all) {
    if (q.id === p.id || q.is_history || q.status === 'elmaradt' || effectiveBedId(q) !== bedId) continue;
    const start = bedStart(q.method, effectiveDates(q)) ?? effectiveDates(q).sow;
    if (!start || start < end || diffDays(end, start) > 366) continue;
    const theirs = placementOf(q, bed);
    if (mine && theirs && !placementsOverlap(mine, theirs)) continue;
    if (!best || start < best.start) best = { p: q, start };
  }
  return best?.p ?? null;
}

/** Az ültetés saját feladatai (beszerzés nélkül). */
function plantingTasks(p: PlantingListItem, { plantings, states, beds }: TaskInput): TaskItem[] {
  const m = methodOf(p);
  const state = (slot: TaskSlot) => states.get(`${slot}:${p.id}`);
  const moved = Object.fromEntries(DATE_FIELDS.map((f) => [f, state(FIELD_SLOT[f])?.moved_to ?? null]));
  const exp = expectedDates(p, moved);
  const plan: PlantingDates = { sow: p.plan_sow_date, transplant: p.plan_transplant_date, harvestStart: p.plan_harvest_start, end: p.plan_end_date };
  const name = capitalize(p.plant_name);
  const series = (p.series_size ?? 0) > 1 ? `sorozat: ${p.series_index}/${p.series_size}` : null;
  const base = {
    year: p.year,
    planting_id: p.id,
    planting_ids: [p.id],
    bed_id: effectiveBedId(p),
    bed_name: p.bed_name,
    bed_color: p.bed_color,
    custom_id: null,
  };
  const drafts: { slot: TaskSlot; date: string | null; planned: string | null; title: string; label: string; extra?: (string | null)[] }[] = [];

  if (usesSow(m) && exp.sow) {
    const resow = m === 'helyrevetes' && (p.series_index ?? 1) > 1;
    drafts.push({
      slot: 'vetes',
      date: exp.sow,
      planned: plan.sow,
      title: m === 'palanta' ? `${name} vetése palántának` : m === 'ultetes' ? `${name} ültetése` : resow ? `${name} újravetése` : `${name} vetése`,
      label: m === 'palanta' ? 'Palántanevelés' : m === 'ultetes' ? 'Ültetés' : resow ? 'Újravetés' : 'Helyrevetés',
      extra: m === 'palanta' && exp.transplant ? [`kiültetés: ${shortDate(exp.transplant)}`] : [],
    });
  }
  if (m === 'vasarolt_palanta' && exp.transplant) {
    drafts.push({
      slot: 'palanta_beszerzes',
      date: addDaysISO(exp.transplant, -SEEDLING_PURCHASE_DAYS),
      planned: plan.transplant ? addDaysISO(plan.transplant, -SEEDLING_PURCHASE_DAYS) : null,
      title: `Palánta beszerzése: ${withVariety(p)}`,
      label: 'Beszerzés',
      extra: [`kiültetés: ${shortDate(exp.transplant)}`],
    });
  }
  if (m === 'palanta' && exp.transplant) {
    drafts.push({
      slot: 'szoktatas',
      date: addDaysISO(exp.transplant, -HARDENING_DAYS),
      planned: plan.transplant ? addDaysISO(plan.transplant, -HARDENING_DAYS) : null,
      title: `${name} palántáinak szoktatása`,
      label: 'Szoktatás',
      extra: [`kiültetés: ${shortDate(exp.transplant)}`, 'naponta egyre több időt töltsenek kint'],
    });
  }
  if (usesTransplant(m) && exp.transplant) {
    drafts.push({ slot: 'kiultetes', date: exp.transplant, planned: plan.transplant, title: `${name} kiültetése`, label: 'Kiültetés' });
  }
  if (exp.harvestStart) {
    drafts.push({
      slot: 'betakaritas',
      date: exp.harvestStart,
      planned: plan.harvestStart,
      title: `${name} betakarításának kezdete`,
      label: 'Betakarítás',
    });
  }
  if (exp.end && !p.perennial) {
    const next = nextOccupant(p, exp.end, plantings, beds);
    drafts.push({
      slot: 'felszabadul',
      date: exp.end,
      planned: plan.end,
      title: `${name} helye felszabadul`,
      label: 'Ágyásrész felszabadul',
      extra: [next ? `utána: ${lower(next.plant_name)}` : null],
    });
  }

  const doneOn = (slot: TaskSlot) => {
    const field = SLOT_FIELD[slot];
    return field ? p[ACTUAL_COLUMN[field]] : (state(slot)?.done_at ?? null);
  };
  // Egy későbbi lépés már megtörtént (vagy az ültetés lezárult): a korábbi, el nem végzett lépések tárgytalanok
  const lastDone = Math.max(-1, ...drafts.filter((d) => doneOn(d.slot)).map((d) => SLOT_ORDER[d.slot]));

  return drafts.flatMap((d) => {
    const done_on = doneOn(d.slot);
    if (!done_on && (p.status === 'lezart' || SLOT_ORDER[d.slot] < lastDone)) return [];
    const st = state(d.slot);
    const moved_to = st?.moved_to ?? null;
    // A dátumhoz kötött lépéseknél az áthelyezés már a várható dátumokban benne van
    const date = SLOT_FIELD[d.slot] ? (done_on ?? d.date!) : (moved_to ?? d.date!);
    return [
      {
        ...base,
        key: taskKey(d.slot as Exclude<TaskSlot, 'beszerzes'>, p.id),
        slot: d.slot,
        category: SLOT_CATEGORY[d.slot],
        label: d.label,
        title: d.title,
        date,
        planned: d.planned,
        moved_to,
        done_on,
        detail: [p.variety_name, amount(p), series, ...(d.extra ?? [])].filter(Boolean).join(' · '),
        note: st?.note ?? null,
      },
    ];
  });
}

/** Vetőmag-beszerzés fajtánként (fajta nélkül növényenként) és évenként, ha nincs készleten. */
function purchaseTasks({ plantings, states }: TaskInput): TaskItem[] {
  const groups = new Map<string, { p: PlantingListItem; first: string }[]>();
  for (const p of plantings) {
    const m = methodOf(p);
    if (p.is_history || p.status !== 'terv' || p.has_seed || !needsSeed(m)) continue;
    if (p.actual_sow_date || p.actual_transplant_date) continue;
    const sow = expectedDates(p, { sow: states.get(taskKey('vetes', p.id))?.moved_to ?? null }).sow;
    if (!sow) continue;
    const key = purchaseKey(p.year, p.variety_id, p.plant_id);
    groups.set(key, [...(groups.get(key) ?? []), { p, first: sow }]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const first = items.map((i) => i.first).reduce(minISO);
    const p = items.find((i) => i.first === first)!.p;
    const st = states.get(key);
    const planned = addDaysISO(first, -SEED_LEAD_DAYS);
    const bedIds = new Set(items.map((i) => effectiveBedId(i.p)));
    const verb = methodOf(p) === 'ultetes' ? 'ültetés' : 'vetés';
    return {
      key,
      slot: 'beszerzes' as const,
      category: 'beszerzes' as const,
      label: 'Beszerzés',
      title: `${methodOf(p) === 'ultetes' ? 'Szaporítóanyag' : 'Vetőmag'} beszerzése: ${withVariety(p)}`,
      date: st?.moved_to ?? planned,
      planned,
      moved_to: st?.moved_to ?? null,
      done_on: st?.done_at ?? null,
      year: p.year,
      planting_id: p.id,
      planting_ids: items.map((i) => i.p.id),
      bed_id: bedIds.size === 1 ? effectiveBedId(p) : null,
      bed_name: bedIds.size === 1 ? p.bed_name : null,
      bed_color: bedIds.size === 1 ? p.bed_color : null,
      detail: [items.length > 1 ? `${items.length} ültetéshez` : null, `első ${verb}: ${shortDate(first)}`, 'nincs készleten'].filter(Boolean).join(' · '),
      note: st?.note ?? null,
      custom_id: null,
    };
  });
}

const CATEGORY_ORDER = Object.fromEntries(TASK_CATEGORIES.map((c, i) => [c, i])) as Record<TaskCategory, number>;
const collator = new Intl.Collator('hu');

export function compareTasks(a: TaskItem, b: TaskItem): number {
  return a.date.localeCompare(b.date) || CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || collator.compare(a.title, b.title);
}

/** Az ültetésekből generált összes feladat (az elmaradt és sikertelen ültetéseké nélkül). */
export function generateTasks(input: TaskInput): TaskItem[] {
  const active = input.plantings.filter((p) => !p.is_history && p.status !== 'elmaradt' && p.status !== 'sikertelen');
  return [...purchaseTasks({ ...input, plantings: active }), ...active.flatMap((p) => plantingTasks(p, input))].sort(compareTasks);
}

// --- Saját feladat -------------------------------------------------------------

export interface CustomTaskRow {
  id: number;
  title: string;
  due_date: string;
  bed_id: number | null;
  planting_id: number | null;
  notes: string | null;
  done_at: string | null;
  bed_name: string | null;
  bed_color: string | null;
}

export function customTaskItem(r: CustomTaskRow): TaskItem {
  return {
    key: customKey(r.id),
    slot: 'sajat',
    category: 'sajat',
    label: 'Saját feladat',
    title: r.title,
    date: r.due_date,
    planned: null,
    moved_to: null,
    done_on: r.done_at,
    year: Number(r.due_date.slice(0, 4)),
    planting_id: r.planting_id,
    planting_ids: r.planting_id ? [r.planting_id] : [],
    bed_id: r.bed_id,
    bed_name: r.bed_name,
    bed_color: r.bed_color,
    detail: r.notes?.split('\n')[0] ?? '',
    note: r.notes,
    custom_id: r.id,
  };
}
