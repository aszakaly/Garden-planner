import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './index.ts';
import { backupDatabase } from './backup.ts';

describe('backupDatabase', () => {
  it('adatbázisonként 30 mentést tart meg, más nevűeket nem töröl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kert-backup-'));
    for (let i = 0; i < 35; i++) {
      writeFileSync(join(dir, `garden-202601${String(i % 28 + 1).padStart(2, '0')}-0000${String(i).padStart(2, '0')}.db`), '');
    }
    writeFileSync(join(dir, 'sandbox-20260101-000000.db'), '');

    const db = openDatabase(':memory:');
    const target = backupDatabase(db, dir, 'sandbox', new Date(2026, 8, 30, 12, 0, 0));
    expect(target).toMatch(/sandbox-20260930-120000\.db$/);

    const files = readdirSync(dir);
    expect(files.filter((f) => f.startsWith('garden-'))).toHaveLength(35);
    expect(files.filter((f) => f.startsWith('sandbox-'))).toHaveLength(2);

    backupDatabase(db, dir, 'garden', new Date(2026, 8, 30, 12, 0, 0));
    expect(readdirSync(dir).filter((f) => f.startsWith('garden-'))).toHaveLength(30);
  });
});
