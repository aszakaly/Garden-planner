import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate } from './index.ts';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

describe('002 – magaságyás típus', () => {
  it('a tábla újraépítése megőrzi az ágyásokat és a rájuk mutató ültetéseket', () => {
    // Régi állapot: csak az első migráció fut le
    const oldDir = mkdtempSync(join(tmpdir(), 'kert-mig-'));
    copyFileSync(join(MIGRATIONS, '001_init.sql'), join(oldDir, '001_init.sql'));
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, oldDir);

    db.exec(`
      INSERT INTO garden (id, name) VALUES (1, 'Kertem');
      INSERT INTO bed (id, garden_id, name, length_cm, width_cm, bed_type) VALUES (7, 1, 'Emelt 1', 400, 120, 'emelt');
      INSERT INTO plant (id, name_hu) VALUES (1, 'Retek');
      INSERT INTO planting (id, year, plant_id, bed_id, actual_bed_id) VALUES (1, 2025, 1, 7, 7);
    `);
    expect(() => db.exec("INSERT INTO bed (garden_id, name, length_cm, width_cm, bed_type) VALUES (1, 'X', 100, 100, 'magasagyas')")).toThrow();

    // Új migrációk
    expect(migrate(db)).toEqual(['002_bed_magasagyas.sql', '003_carry_over.sql']);

    expect(db.prepare('SELECT bed_id, actual_bed_id FROM planting WHERE id = 1').get()).toEqual({ bed_id: 7, actual_bed_id: 7 });
    expect(db.prepare('SELECT name, bed_type FROM bed WHERE id = 7').get()).toEqual({ name: 'Emelt 1', bed_type: 'emelt' });
    db.exec("INSERT INTO bed (garden_id, name, length_cm, width_cm, bed_type) VALUES (1, 'Magas 1', 200, 80, 'magasagyas')");

    // Az idegenkulcs-ellenőrzés visszakapcsolva, és a hivatkozás továbbra is él
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(() => db.exec('INSERT INTO planting (year, plant_id, bed_id) VALUES (2026, 1, 999)')).toThrow();
  });
});
