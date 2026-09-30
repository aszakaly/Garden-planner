import { networkInterfaces, hostname } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db/index.ts';
import { backupDatabase } from './db/backup.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Saját változónév: a PORT-ot más eszközök (pl. előnézet-indítók) is beállíthatják.
const PORT = Number(process.env.KERT_PORT ?? 4321);
const DB_PATH = process.env.KERT_DB ?? join(ROOT, 'data', 'garden.db');

const db = openDatabase(DB_PATH);
const seeded = seedIfEmpty(db);
const backup = backupDatabase(db, join(dirname(DB_PATH), 'backups'));

const app = buildApp({
  db,
  clientDir: process.env.NODE_ENV === 'production' ? join(ROOT, 'dist', 'client') : undefined,
});

await app.listen({ port: PORT, host: '0.0.0.0' });

const lan = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
console.log(`\n🌱 Kerttervező fut`);
console.log(`   Ezen a gépen:   http://localhost:${PORT}`);
console.log(`   Otthoni hálón:  http://${hostname().replace(/\.local$/, '')}.local:${PORT}${lan ? `  (${lan})` : ''}`);
console.log(`   Adatbázis:      ${DB_PATH}`);
console.log(`   Mentés:         ${backup}`);
if (seeded) console.log('   Kezdő törzsadatok betöltve (növények, családok, társítások).');
console.log('');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
