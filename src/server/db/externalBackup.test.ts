import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './index.ts';
import {
  copyToTarget,
  isDue,
  localParts,
  parseTargets,
  readState,
  runExternalBackup,
  TARGET_MARKER,
  type ExternalConfig,
} from './externalBackup.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'kert-kulso-'));

function target(name: string, marker = true) {
  const dir = join(tmp(), name);
  mkdirSync(dir, { recursive: true });
  if (marker) writeFileSync(join(dir, TARGET_MARKER), '');
  return { name, dir };
}

describe('külső mentés – beállítás', () => {
  it('a célok a név=mappa listából jönnek; üres érték esetén nincs külső mentés', () => {
    expect(parseTargets('lemez=/masolat/lemez, dropbox=/masolat/dropbox')).toEqual([
      { name: 'lemez', dir: '/masolat/lemez' },
      { name: 'dropbox', dir: '/masolat/dropbox' },
    ]);
    expect(parseTargets(undefined)).toEqual([]);
    expect(parseTargets('  ')).toEqual([]);
    expect(() => parseTargets('lemez')).toThrow(/név=mappa/);
  });
});

describe('külső mentés – időzítés', () => {
  it('a helyi idő budapesti, a gép időzónájától függetlenül', () => {
    expect(localParts(new Date('2027-01-10T02:30:00Z'))).toEqual({ day: '2027-01-10', hour: 3 });
    expect(localParts(new Date('2027-07-10T00:30:00Z'))).toEqual({ day: '2027-07-10', hour: 2 });
    expect(localParts(new Date('2027-07-10T22:30:00Z'))).toEqual({ day: '2027-07-11', hour: 0 });
  });

  it('03:00 előtt nem esedékes, utána igen, amíg a mai napra nincs mentés', () => {
    expect(isDue(new Date('2027-01-10T01:59:00Z'), undefined)).toBe(false); // 02:59
    expect(isDue(new Date('2027-01-10T02:00:00Z'), undefined)).toBe(true); // 03:00
    expect(isDue(new Date('2027-01-10T15:00:00Z'), { lastSuccessDay: '2027-01-10' })).toBe(false);
    // Kikapcsolt szerver: este bekapcsolva a tegnapi mentés után pótol
    expect(isDue(new Date('2027-01-10T18:00:00Z'), { lastSuccessDay: '2027-01-08' })).toBe(true);
  });

  it('tavaszi óraátállítás (2027-03-28, 02:00 → 03:00): pontosan egyszer esedékes', () => {
    // 01:59 helyi (téli idő) → még nem; a következő perc már 03:00 nyári idő
    expect(isDue(new Date('2027-03-28T00:59:00Z'), { lastSuccessDay: '2027-03-27' })).toBe(false);
    expect(isDue(new Date('2027-03-28T01:00:00Z'), { lastSuccessDay: '2027-03-27' })).toBe(true);
    expect(localParts(new Date('2027-03-28T01:00:00Z'))).toEqual({ day: '2027-03-28', hour: 3 });
    expect(isDue(new Date('2027-03-28T02:00:00Z'), { lastSuccessDay: '2027-03-28' })).toBe(false);
  });

  it('őszi óraátállítás (2027-10-31, 03:00 → 02:00): a kétszer eltelő 02 óra alatt nem fut, 03:00-kor egyszer', () => {
    // 02:30 nyári idő, majd 02:30 téli idő: egyik sem esedékes
    expect(isDue(new Date('2027-10-31T00:30:00Z'), { lastSuccessDay: '2027-10-30' })).toBe(false);
    expect(isDue(new Date('2027-10-31T01:30:00Z'), { lastSuccessDay: '2027-10-30' })).toBe(false);
    // 03:00 téli idő
    expect(isDue(new Date('2027-10-31T02:00:00Z'), { lastSuccessDay: '2027-10-30' })).toBe(true);
    expect(isDue(new Date('2027-10-31T03:00:00Z'), { lastSuccessDay: '2027-10-31' })).toBe(false);
  });
});

describe('külső mentés – másolás és megőrzés', () => {
  it('40 nap után 30 napi és legfeljebb 12 havi fájl marad, más fájlhoz nem nyúl', () => {
    const t = target('lemez');
    writeFileSync(join(t.dir, 'sajat-jegyzet.txt'), 'marad');
    const snapshot = join(tmp(), 'snap.db');
    writeFileSync(snapshot, 'adat');
    // 2027-01-01-től 400 napon át naponta
    const start = Date.UTC(2027, 0, 1, 12);
    for (let i = 0; i < 400; i++) {
      copyToTarget(snapshot, t, new Date(start + i * 86_400_000).toISOString().slice(0, 10));
    }
    const daily = readdirSync(join(t.dir, 'napi')).sort();
    const monthly = readdirSync(join(t.dir, 'havi')).sort();
    expect(daily).toHaveLength(30);
    expect(daily.at(-1)).toBe('garden-20280204.db');
    expect(monthly).toHaveLength(12);
    expect(monthly.at(-1)).toBe('garden-202802.db');
    expect(monthly[0]).toBe('garden-202703.db');
    expect(existsSync(join(t.dir, 'sajat-jegyzet.txt'))).toBe(true);
    expect(daily.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('jelölőfájl nélkül (csatolatlan cél) nem ír semmit', () => {
    const t = target('dropbox', false);
    const snapshot = join(tmp(), 'snap.db');
    writeFileSync(snapshot, 'adat');
    expect(() => copyToTarget(snapshot, t, '2027-01-10')).toThrow(/nincs csatolva/);
    expect(readdirSync(t.dir)).toEqual([]);
  });
});

describe('külső mentés – futtatás', () => {
  function setup(markers: [boolean, boolean] = [true, true]) {
    const work = tmp();
    const db = openDatabase(join(work, 'garden.db'));
    db.exec("INSERT INTO garden (name) VALUES ('Kertem')");
    const config: ExternalConfig = {
      targets: [target('lemez', markers[0]), target('dropbox', markers[1])],
      stateFile: join(work, 'kulso-mentes.json'),
      workDir: work,
    };
    return { db, config, work };
  }

  it('esedékes célokra ment, az állapotot megőrzi, a pillanatképet törli', () => {
    const { db, config, work } = setup();
    const now = new Date('2027-01-10T02:05:00Z');
    const state = runExternalBackup(db, config, now);
    expect(state.lemez).toMatchObject({ lastSuccessDay: '2027-01-10', lastSuccess: now.toISOString() });
    expect(state.dropbox?.lastSuccessDay).toBe('2027-01-10');
    expect(readState(config.stateFile)).toEqual(state);
    expect(existsSync(join(config.targets[0]!.dir, 'napi', 'garden-20270110.db'))).toBe(true);
    expect(readdirSync(work).filter((f) => f.includes('pillanatkep'))).toEqual([]);

    // Ugyanazon a napon újra nem fut, de kérésre igen
    const later = new Date('2027-01-10T10:00:00Z');
    expect(runExternalBackup(db, config, later).lemez?.lastSuccess).toBe(now.toISOString());
    expect(runExternalBackup(db, config, later, true).lemez?.lastSuccess).toBe(later.toISOString());
  });

  it('a hibás cél nem állítja meg a többit, és a hibát megőrzi; később pótolja', () => {
    const { db, config } = setup([true, false]);
    const now = new Date('2027-01-10T02:05:00Z');
    const state = runExternalBackup(db, config, now);
    expect(state.lemez?.lastSuccessDay).toBe('2027-01-10');
    expect(state.dropbox).toMatchObject({ lastErrorAt: now.toISOString() });
    expect(state.dropbox?.lastError).toMatch(/nincs csatolva/);
    expect(state.dropbox?.lastSuccess).toBeUndefined();

    // A Dropbox visszajön: a következő órában pótol, a lemezre nem ment újra
    writeFileSync(join(config.targets[1]!.dir, TARGET_MARKER), '');
    const later = new Date('2027-01-10T03:05:00Z');
    const after = runExternalBackup(db, config, later);
    expect(after.dropbox?.lastSuccess).toBe(later.toISOString());
    expect(after.lemez?.lastSuccess).toBe(now.toISOString());
  });
});
