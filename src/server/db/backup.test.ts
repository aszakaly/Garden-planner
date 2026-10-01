import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './index.ts';
import { backupDatabase, listBackups } from './backup.ts';

const NOW = new Date(2026, 8, 30, 12, 0, 0);
const old = new Date(2026, 0, 1);

function fakeBackups(dir: string, name: string, count: number) {
  for (let i = 0; i < count; i++) {
    const file = join(dir, `${name}-202601${String((i % 28) + 1).padStart(2, '0')}-0000${String(i).padStart(2, '0')}.db`);
    writeFileSync(file, '');
    utimesSync(file, old, old);
  }
}

describe('backupDatabase', () => {
  it('adatbázisonként 30 mentést tart meg, más nevűeket nem töröl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kert-backup-'));
    fakeBackups(dir, 'garden', 35);
    fakeBackups(dir, 'sandbox', 1);
    const db = openDatabase(':memory:');

    expect(backupDatabase(db, dir, 'sandbox', NOW)).toMatch(/sandbox-20260930-120000\.db$/);
    const files = readdirSync(dir);
    expect(files.filter((f) => f.startsWith('garden-'))).toHaveLength(35);
    expect(files.filter((f) => f.startsWith('sandbox-'))).toHaveLength(2);

    backupDatabase(db, dir, 'garden', NOW);
    expect(readdirSync(dir).filter((f) => f.startsWith('garden-'))).toHaveLength(30);
  });

  it('6 órán belül nem készít újabb mentést (gyakori újraindításnál)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kert-backup-'));
    const db = openDatabase(':memory:');
    expect(backupDatabase(db, dir, 'garden', new Date())).not.toBeNull();
    expect(backupDatabase(db, dir, 'garden', new Date(Date.now() + 60_000))).toBeNull();
    expect(backupDatabase(db, dir, 'garden', new Date(Date.now() + 7 * 3600_000))).not.toBeNull();
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it('kényszerítve azonnal is ment, ugyanabban a másodpercben sem ír felül', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kert-backup-'));
    const db = openDatabase(':memory:');
    const a = backupDatabase(db, dir, 'garden', NOW);
    const b = backupDatabase(db, dir, 'garden', NOW, true);
    expect(b).not.toBe(a);
    expect(b).toMatch(/garden-20260930-120001\.db$/);
    expect(listBackups(dir, 'garden').map((x) => x.name)).toEqual(['garden-20260930-120001.db', 'garden-20260930-120000.db']);
  });
});
