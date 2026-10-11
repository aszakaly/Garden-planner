import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate } from './index.ts';
import { PLANT_DATA_SOURCE } from './seed.ts';

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
    expect(migrate(db)).toEqual(expect.arrayContaining(['002_bed_magasagyas.sql', '003_carry_over.sql']));

    expect(db.prepare('SELECT bed_id, actual_bed_id FROM planting WHERE id = 1').get()).toEqual({ bed_id: 7, actual_bed_id: 7 });
    expect(db.prepare('SELECT name, bed_type FROM bed WHERE id = 7').get()).toEqual({ name: 'Emelt 1', bed_type: 'emelt' });
    db.exec("INSERT INTO bed (garden_id, name, length_cm, width_cm, bed_type) VALUES (1, 'Magas 1', 200, 80, 'magasagyas')");

    // Az idegenkulcs-ellenőrzés visszakapcsolva, és a hivatkozás továbbra is él
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    expect(() => db.exec('INSERT INTO planting (year, plant_id, bed_id) VALUES (2026, 1, 999)')).toThrow();
  });
});

describe('004 – a növényadatok forrás-megjelölése', () => {
  it('csak az eredeti szöveget cseréli, a saját forrást nem', () => {
    const oldDir = mkdtempSync(join(tmpdir(), 'kert-mig-'));
    for (const f of ['001_init.sql', '002_bed_magasagyas.sql', '003_carry_over.sql']) copyFileSync(join(MIGRATIONS, f), join(oldDir, f));
    const db = new DatabaseSync(':memory:');
    migrate(db, oldDir);
    db.exec(`
      INSERT INTO plant (id, name_hu, source) VALUES (1, 'Retek', 'Alapadat: magyar vetési naptárak (kertvar.hu, agroinform.hu, kertlap.hu) alapján összeállítva');
      INSERT INTO plant (id, name_hu, source) VALUES (2, 'Saját', 'nagymama füzete');
    `);
    expect(migrate(db)[0]).toBe('004_plant_source.sql');
    const sources = db.prepare('SELECT source FROM plant ORDER BY id').all().map((r) => r.source);
    expect(sources[0]).toBe(PLANT_DATA_SOURCE);
    expect(sources[1]).toBe('nagymama füzete');
  });
});

describe('005 – ültetés-azonosító AUTOINCREMENT-tel', () => {
  it('a tábla újraépítése megőrzi az ültetéseket és a hivatkozásokat; törölt azonosító nem jön vissza', () => {
    const oldDir = mkdtempSync(join(tmpdir(), 'kert-mig-'));
    for (const f of ['001_init.sql', '002_bed_magasagyas.sql', '003_carry_over.sql', '004_plant_source.sql']) {
      copyFileSync(join(MIGRATIONS, f), join(oldDir, f));
    }
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db, oldDir);
    db.exec(`
      INSERT INTO garden (id, name) VALUES (1, 'Kertem');
      INSERT INTO bed (id, garden_id, name, length_cm, width_cm) VALUES (7, 1, 'Emelt 1', 400, 120);
      INSERT INTO plant (id, name_hu) VALUES (1, 'Retek');
      INSERT INTO planting (id, year, plant_id, bed_id, axis_start_cm, carried_from_id) VALUES (1, 2026, 1, 7, 30, NULL), (5, 2027, 1, 7, 0, 1);
      INSERT INTO journal_entry (id, entry_date, planting_id) VALUES (1, '2027-05-01', 5);
      INSERT INTO custom_task (id, title, due_date, planting_id) VALUES (1, 'Gyomlálás', '2027-05-02', 5);
    `);

    expect(migrate(db)).toEqual(['005_planting_autoincrement.sql']);
    expect(db.prepare('SELECT id, axis_start_cm, carried_from_id FROM planting ORDER BY id').all()).toEqual([
      { id: 1, axis_start_cm: 30, carried_from_id: null },
      { id: 5, axis_start_cm: 0, carried_from_id: 1 },
    ]);

    // a legnagyobb azonosító törlése után az új ültetés nagyobbat kap
    db.exec('DELETE FROM planting WHERE id = 1');
    db.exec('DELETE FROM planting WHERE id = 5');
    db.exec('INSERT INTO planting (year, plant_id) VALUES (2027, 1)');
    expect(db.prepare('SELECT id FROM planting').get()).toEqual({ id: 6 });

    // a hivatkozások továbbra is élnek: a törlés a naplóból leválasztott, a feladatot törölte
    expect(db.prepare('SELECT planting_id FROM journal_entry WHERE id = 1').get()).toEqual({ planting_id: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM custom_task').get()).toEqual({ n: 0 });
    expect(() => db.exec('INSERT INTO planting (year, plant_id, bed_id) VALUES (2027, 1, 999)')).toThrow();
  });
});

describe('mentés a migráció előtt', () => {
  it('használt adatbázisnál a függő migrációk előtt egyszer lefut, újnál és naprakésznél nem', () => {
    const calls: string[] = [];
    const before = (db: DatabaseSync) => calls.push(String((db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n));
    const fresh = new DatabaseSync(':memory:');
    migrate(fresh, MIGRATIONS, before);
    expect(calls).toEqual([]);

    const oldDir = mkdtempSync(join(tmpdir(), 'kert-mig-'));
    copyFileSync(join(MIGRATIONS, '001_init.sql'), join(oldDir, '001_init.sql'));
    const used = new DatabaseSync(':memory:');
    migrate(used, oldDir);
    migrate(used, MIGRATIONS, before);
    // a mentés még a régi szerkezeten fut (egy alkalmazott migrációval)
    expect(calls).toEqual(['1']);
    migrate(used, MIGRATIONS, before);
    expect(calls).toEqual(['1']);
  });
});
