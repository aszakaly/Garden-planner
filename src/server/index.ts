import { networkInterfaces, hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';
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
const backup = backupDatabase(db, join(dirname(DB_PATH), 'backups'), basename(DB_PATH, '.db'));

const production = process.env.NODE_ENV === 'production';
const app = buildApp({ db, clientDir: production ? join(ROOT, 'dist', 'client') : undefined });

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  if ((err as { code?: string }).code === 'EADDRINUSE') {
    console.error(`\n⚠️  A ${PORT}-es port foglalt – valószínűleg már fut egy Kerttervező. Állítsd le, vagy adj meg másik portot: KERT_PORT=4322\n`);
    process.exit(1);
  }
  throw err;
}

const lan = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
const host = `${hostname().replace(/\.local$/, '')}.local`;
console.log(`\n🌱 Kerttervező fut`);
if (production) {
  console.log(`   Ezen a gépen:   http://localhost:${PORT}`);
  console.log(`   Otthoni hálón:  http://${host}:${PORT}${lan ? `  (${lan})` : ''}`);
} else {
  console.log(`   Fejlesztői mód: a felület a [client] sorban kiírt Vite-címen érhető el (pl. :5173),`);
  console.log(`                   az API itt fut: http://localhost:${PORT}/api`);
}
console.log(`   Adatbázis:      ${DB_PATH}`);
console.log(`   Mentés:         ${backup ?? 'a legutóbbi mentés 6 óránál frissebb, most nem készült új'}`);
if (seeded) console.log('   Kezdő törzsadatok betöltve (növények, családok, társítások).');
console.log('');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
