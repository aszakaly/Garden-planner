import { existsSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db/index.ts';
import { backupDatabase } from './db/backup.ts';
import { parseTargets, runExternalBackup, type ExternalConfig } from './db/externalBackup.ts';
import { seedIfEmpty } from './db/seed.ts';
import { buildApp } from './app.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Saját változónév: a PORT-ot más eszközök (pl. előnézet-indítók) is beállíthatják.
const PORT = Number(process.env.KERT_PORT ?? 4321);
const DB_PATH = process.env.KERT_DB ?? join(ROOT, 'data', 'garden.db');

// Külső mentés (csak ahol a KERT_KULSO_MENTES meg van adva, pl. az éles ZimaOS-példányon)
const externalTargets = parseTargets(process.env.KERT_KULSO_MENTES);
const external: ExternalConfig | undefined = externalTargets.length
  ? { targets: externalTargets, stateFile: join(dirname(DB_PATH), 'kulso-mentes.json'), workDir: dirname(DB_PATH) }
  : undefined;
const backupConfig = { dir: join(dirname(DB_PATH), 'backups'), name: basename(DB_PATH, '.db'), external };
// Az adatbázis-szerkezet módosítása (migráció) előtt mindig készül mentés, a 6 órás korláttól függetlenül
let migrationBackup: string | null = null;
const db = openDatabase(DB_PATH, {
  beforeMigrate: (raw) => {
    migrationBackup = backupDatabase(raw, backupConfig.dir, backupConfig.name, new Date(), true);
  },
});
const seeded = seedIfEmpty(db);
const backup = migrationBackup ?? backupDatabase(db, backupConfig.dir, backupConfig.name);

const production = process.env.NODE_ENV === 'production';
const info = { version: process.env.KERT_VERZIO || 'fejlesztői', environment: process.env.KERT_KORNYEZET || undefined };
const app = buildApp({ db, backup: backupConfig, info, clientDir: production ? join(ROOT, 'dist', 'client') : undefined });

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
  // Konténerben a belső hálózati cím félrevezető: ott a szerver gépének címe számít
  if (!existsSync('/.dockerenv')) console.log(`   Otthoni hálón:  http://${host}:${PORT}${lan ? `  (${lan})` : ''}`);
} else {
  console.log(`   Fejlesztői mód: a felület a [client] sorban kiírt Vite-címen érhető el (pl. :5173),`);
  console.log(`                   az API itt fut: http://localhost:${PORT}/api`);
}
console.log(`   Verzió:         ${info.version}${info.environment ? ` (${info.environment})` : ''}`);
console.log(`   Adatbázis:      ${DB_PATH}`);
console.log(`   Mentés:         ${backup ?? 'a legutóbbi mentés 6 óránál frissebb, most nem készült új'}`);
if (seeded) console.log('   Kezdő törzsadatok betöltve (növények, családok, társítások).');
if (external) console.log(`   Külső mentés:   ${external.targets.map((t) => `${t.name} (${t.dir})`).join(', ')}`);
console.log('');

if (external) {
  // Induláskor és óránként: ha elmúlt 03:00, és a mai napra még nincs külső mentés, most készül (pótlás is)
  const tick = () => {
    try {
      const state = runExternalBackup(db, external, new Date());
      for (const t of external.targets) {
        const s = state[t.name];
        if (s?.lastErrorAt && (!s.lastSuccess || s.lastErrorAt > s.lastSuccess)) console.error(`Külső mentés (${t.name}): ${s.lastError}`);
      }
    } catch (err) {
      console.error('Külső mentés: nem sikerült', err);
    }
  };
  tick();
  setInterval(tick, 60 * 60 * 1000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
