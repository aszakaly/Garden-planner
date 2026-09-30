import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, type DB } from './db/index.ts';
import { buildApp } from './app.ts';

describe('API alapok', () => {
  let db: DB;
  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('a migrációk lefutnak üres adatbázison', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(['plant', 'variety', 'bed', 'planting', 'journal_entry', 'crop_group']),
    );
  });

  it('beállítások: alapértékek és módosítás', async () => {
    const app = buildApp({ db });
    const initial = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(initial.json()).toMatchObject({ lastFrost: '05-10', firstFrost: '10-20' });

    const updated = await app.inject({ method: 'PUT', url: '/api/settings', payload: { lastFrost: '05-05' } });
    expect(updated.json().lastFrost).toBe('05-05');

    const invalid = await app.inject({ method: 'PUT', url: '/api/settings', payload: { lastFrost: '13-40' } });
    expect(invalid.statusCode).toBe(400);
  });
});
