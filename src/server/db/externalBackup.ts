import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './index.ts';

/**
 * Külső mentés: naponta egy másolat az adatbázisról a szerveren kívüli célokra
 * (pl. a második lemezre és a Dropboxba), 30 napi és 12 havi megőrzéssel.
 */

/** Ennek a fájlnak a cél gyökerében kell lennie; ha hiányzik, a cél nincs csatolva, oda nem írunk. */
export const TARGET_MARKER = '.kerttervezo-mentes-cel';
export const KEEP_DAILY = 30;
export const KEEP_MONTHLY = 12;
/** Ettől az órától (helyi idő) esedékes a napi mentés */
export const DAILY_HOUR = 3;
const TIME_ZONE = 'Europe/Budapest';

export interface ExternalTarget {
  name: string;
  dir: string;
}

export interface TargetState {
  /** Az utolsó sikeres mentés ideje (ISO) és helyi napja (ÉÉÉÉ-HH-NN) */
  lastSuccess?: string;
  lastSuccessDay?: string;
  /** Az utolsó hiba ideje és üzenete; ha újabb a sikernél, a cél hibás */
  lastErrorAt?: string;
  lastError?: string;
}

export type ExternalState = Record<string, TargetState>;

export interface ExternalConfig {
  targets: ExternalTarget[];
  /** Az állapotfájl (az adatbázis mellett, hogy újraindítás után is megmaradjon) */
  stateFile: string;
  /** Ide készül az ideiglenes pillanatkép */
  workDir: string;
}

/** `lemez=/masolat/lemez,dropbox=/masolat/dropbox` → célok; üres vagy hiányzó érték esetén nincs külső mentés. */
export function parseTargets(value: string | undefined): ExternalTarget[] {
  if (!value?.trim()) return [];
  return value.split(',').map((part) => {
    const [name, dir] = part.split('=').map((x) => x?.trim());
    if (!name || !dir) throw new Error(`Hibás KERT_KULSO_MENTES elem: „${part}” (helyesen: név=mappa)`);
    return { name, dir };
  });
}

/** A helyi (budapesti) nap és óra, a gép időzónájától függetlenül. */
export function localParts(now: Date): { day: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/**
 * Esedékes-e a napi mentés erre a célra: ha a helyi idő már elmúlt 03:00, és a mai napra még nincs sikeres mentés.
 * Naptári napra szól, nem órák számára, így az óraátállítás napján sem marad ki és nem duplázódik.
 */
export function isDue(now: Date, state: TargetState | undefined): boolean {
  const { day, hour } = localParts(now);
  return hour >= DAILY_HOUR && state?.lastSuccessDay !== day;
}

export function readState(stateFile: string): ExternalState {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8')) as ExternalState;
  } catch {
    return {};
  }
}

/** Írás ideiglenes néven, majd átnevezés: félbemaradt fájl nem marad a célon. */
function copyAtomic(from: string, to: string) {
  const tmp = `${to}.tmp`;
  copyFileSync(from, tmp);
  renameSync(tmp, to);
}

/** A mintára illő fájlok közül a legújabb `keep` marad; más fájlhoz nem nyúl. */
function prune(dir: string, pattern: RegExp, keep: number) {
  const files = readdirSync(dir)
    .filter((f) => pattern.test(f))
    .sort();
  for (const old of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, old));
}

/** Egy pillanatkép másolása egy célra: napi és havi fájl, majd a megőrzésen túliak törlése. */
export function copyToTarget(snapshot: string, target: ExternalTarget, day: string): void {
  if (!existsSync(join(target.dir, TARGET_MARKER))) {
    throw new Error('A cél nincs csatolva, ide nem készült mentés.');
  }
  const compact = day.replaceAll('-', '');
  const daily = join(target.dir, 'napi');
  const monthly = join(target.dir, 'havi');
  mkdirSync(daily, { recursive: true });
  mkdirSync(monthly, { recursive: true });
  copyAtomic(snapshot, join(daily, `garden-${compact}.db`));
  // A havi fájl a hónap legutóbbi napi mentése: minden nap felülíródik, a hónap végén a hónap utolsó napja marad
  copyAtomic(snapshot, join(monthly, `garden-${compact.slice(0, 6)}.db`));
  prune(daily, /^garden-\d{8}\.db$/, KEEP_DAILY);
  prune(monthly, /^garden-\d{6}\.db$/, KEEP_MONTHLY);
}

/**
 * Külső mentés az esedékes célokra (`force` esetén mindegyikre). Egy közös pillanatkép készül,
 * a célonkénti hiba nem állítja meg a többit. Visszaadja a frissített állapotot.
 */
export function runExternalBackup(db: DB, config: ExternalConfig, now = new Date(), force = false): ExternalState {
  const state = readState(config.stateFile);
  const due = config.targets.filter((t) => force || isDue(now, state[t.name]));
  if (!due.length) return state;

  const { day } = localParts(now);
  mkdirSync(config.workDir, { recursive: true });
  const snapshot = join(config.workDir, '.kulso-mentes-pillanatkep.db');
  rmSync(snapshot, { force: true });
  db.exec(`VACUUM INTO '${snapshot.replaceAll("'", "''")}'`);
  try {
    for (const target of due) {
      const s: TargetState = (state[target.name] ??= {});
      try {
        copyToTarget(snapshot, target, day);
        s.lastSuccess = now.toISOString();
        s.lastSuccessDay = day;
      } catch (err) {
        s.lastErrorAt = now.toISOString();
        // A fájlrendszer hibái angolul jönnek; a felületen magyar üzenet és a hibakód jelenik meg
        const code = (err as NodeJS.ErrnoException).code;
        s.lastError = code ? `A cél nem írható (${code}).` : (err as Error).message;
      }
    }
  } finally {
    rmSync(snapshot, { force: true });
  }
  writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
  return state;
}
