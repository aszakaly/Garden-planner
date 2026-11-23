import { basename } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import type { DB } from '../db/index.ts';
import { backupDatabase, listBackups } from '../db/backup.ts';
import { readState, runExternalBackup, type ExternalConfig } from '../db/externalBackup.ts';
import { exportData, importData } from '../db/exchange.ts';
import { HttpError } from '../db/helpers.ts';

export interface BackupConfig {
  dir: string;
  /** Az adatbázis neve (a mentések fájlnevének eleje) */
  name: string;
  /** Külső mentés (második lemez, Dropbox); ha nincs megadva, ki van kapcsolva */
  external?: ExternalConfig;
}

/** Mentések, JSON export és visszatöltés. */
export const dataRoutes =
  (db: DB, backup?: BackupConfig): FastifyPluginAsync =>
  async (app) => {
    const backupNow = () => {
      if (!backup) throw new HttpError(501, 'A mentés ebben a környezetben nincs beállítva.');
      return basename(backupDatabase(db, backup.dir, backup.name, new Date(), true)!);
    };

    // A külső mentés célonkénti állapota a felületnek (null, ha nincs beállítva)
    const externalStatus = (state = backup?.external ? readState(backup.external.stateFile) : {}) =>
      backup?.external ? { targets: backup.external.targets.map((t) => ({ name: t.name, ...state[t.name] })) } : null;

    app.get('/backups', async () => ({
      dir: backup?.dir ?? null,
      files: backup ? listBackups(backup.dir, backup.name) : [],
      external: externalStatus(),
    }));
    app.post('/backups/external', async () => {
      if (!backup?.external) throw new HttpError(501, 'A külső mentés ebben a környezetben nincs beállítva.');
      return externalStatus(runExternalBackup(db, backup.external, new Date(), true));
    });
    app.post('/backups', async (_req, reply) => reply.status(201).send({ file: backupNow() }));

    app.get('/export', async (_req, reply) => {
      const data = exportData(db);
      const day = data.exported_at.slice(0, 10);
      return reply.header('content-disposition', `attachment; filename="kerttervezo-${day}.json"`).send(data);
    });

    // Visszatöltés előtt mindig készül mentés, így egy rossz fájl sem visz el semmit
    app.post('/import', { bodyLimit: 100 * 1024 * 1024 }, async (req) => {
      const file = backup ? backupNow() : null;
      return { counts: importData(db, req.body), backup: file };
    });
  };
