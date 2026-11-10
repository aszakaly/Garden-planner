/**
 * A Súgó képernyőképeinek elkészítése a mintakertből.
 *
 *   npm run sugo                 # build, majd az összes kép
 *   npm run sugo -- --no-build   # a meglévő dist/client-tel
 *
 * Saját szervert indít a :4361-es porton, minden fázis előtt üres data/sugo/garden.db-vel,
 * így a valódi adatokhoz nem nyúl. A böngésző órája rögzített: a tervezés 2027. február 15-én,
 * a kerti rész 2027. május 10-én játszódik. A képek a src/client/public/sugo/ mappába kerülnek.
 */
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { loadSampleGarden } from './mintakert.ts';

const PORT = 4361;
const BASE = `http://localhost:${PORT}`;
const OUT = 'src/client/public/sugo';
const PLANNING_DAY = new Date('2027-02-15T09:00:00');
const SEASON_DAY = new Date('2027-05-10T08:30:00');

let server: ChildProcess | null = null;

async function startServer(season: boolean) {
  await stopServer();
  rmSync('data/sugo', { recursive: true, force: true });
  server = spawn('npx', ['tsx', 'src/server/index.ts'], {
    env: { ...process.env, KERT_PORT: String(PORT), KERT_DB: 'data/sugo/garden.db', NODE_ENV: 'production' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      /* még indul */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await loadSampleGarden(BASE, { season });
}

async function stopServer() {
  if (!server) return;
  const s = server;
  server = null;
  await new Promise<void>((resolve) => {
    s.once('exit', () => resolve());
    s.kill();
  });
}

/** Asztali (1280×800) vagy telefonos (390×844) böngészőkörnyezet, rögzített órával. */
async function context(browser: Browser, kind: 'desktop' | 'phone', day: Date): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
    deviceScaleFactor: 2,
    ...(kind === 'phone'
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 800 } }),
  });
  await ctx.clock.setFixedTime(day);
  return ctx;
}

const file = (name: string) => `${OUT}/${name}.jpg`;

/** A teljes látható képernyő. */
async function shot(page: Page, name: string) {
  await settle(page);
  await page.screenshot({ path: file(name), type: 'jpeg', quality: 85 });
  console.log('  ', name);
}

/** A fő terület az oldalsáv nélkül (telefonon olvashatóbb), a látható magasságban. */
async function shotMain(page: Page, name: string) {
  await settle(page);
  const box = (await page.locator('main').boundingBox())!;
  const vp = page.viewportSize()!;
  await page.screenshot({ path: file(name), type: 'jpeg', quality: 85, clip: { x: box.x, y: 0, width: vp.width - box.x, height: vp.height } });
  console.log('  ', name);
}

/** Egy elem képe, legfeljebb `maxHeight` magasan (a hosszú paneleknek csak a teteje kell). */
async function shotOf(page: Page, el: Locator, name: string, opts: { maxHeight?: number; pad?: number } = {}) {
  await el.scrollIntoViewIfNeeded();
  await settle(page);
  const box = (await el.boundingBox())!;
  const pad = opts.pad ?? 0;
  const height = Math.min(box.height, opts.maxHeight ?? box.height);
  if (box.y + height > page.viewportSize()!.height) {
    // A kivágás csak a látható részből készülhet: az elem tetejét a képernyő tetejére görgetjük
    await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
    await settle(page);
  }
  const b = (await el.boundingBox())!;
  await page.screenshot({
    path: file(name),
    type: 'jpeg',
    quality: 85,
    clip: { x: b.x - pad, y: Math.max(0, b.y - pad), width: b.width + 2 * pad, height: height + 2 * pad },
  });
  console.log('  ', name);
}

/** Megvárja az animációk és a lekérdezések végét; a fókuszt leveszi (ne látsszon kijelölt mező). */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(400);
}

/** Kiemelő keret egy elem köré (a képen jelzi, hová kell koppintani). */
async function mark(el: Locator) {
  await el.evaluate((n: HTMLElement) => {
    n.style.outline = '3px solid #ff9500';
    n.style.outlineOffset = '3px';
    n.style.borderRadius = n.style.borderRadius || '8px';
  });
}
async function unmark(el: Locator) {
  await el.evaluate((n: HTMLElement) => {
    n.style.outline = '';
    n.style.outlineOffset = '';
  });
}

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });

// --- Fázisok -------------------------------------------------------------------

/** Kezdés, tervezés és bevásárlólista: 2027. február 15., asztali nézet. */
async function planning(browser: Browser) {
  await startServer(false);
  const ctx = await context(browser, 'desktop', PLANNING_DAY);
  const page = await ctx.newPage();
  const panel = page.getByRole('complementary', { name: 'Részletek' });

  await page.goto('/het');
  await shot(page, 'kezdes-asztal');

  await page.goto('/terv');
  await shotMain(page, 'terv-eves-terv');

  // Üres ágyás: az áttekintő panel megmondja, mi következik a vetésforgóban
  await page.goto('/agyas/4');
  await shotMain(page, 'terv-ures-agyas');

  const free = page.getByText('Mi kerülhet ide?', { exact: true }).first();
  await mark(free);
  await shotMain(page, 'terv-mi-kerulhet');
  await unmark(free);
  await free.click();
  await shotOf(page, panel, 'terv-javaslatok', { maxHeight: 620 });

  await panel.getByText(/^Bokorbab/).first().click();
  await shotMain(page, 'terv-uj-sav');
  const save = page.getByRole('button', { name: 'Mentés', exact: true });
  await save.click();
  await page.getByText('nem mentett módosítás').waitFor({ state: 'hidden' });

  // Figyelmeztetés: paradicsom a tavalyi burgonya helyén (a főveteményt nézzük)
  await page.goto('/agyas/1');
  await page.getByRole('button', { name: /^Fővetemény/ }).click();
  await shotMain(page, 'terv-figyelmeztetes');

  await page.goto('/figyelmeztetesek');
  await shotMain(page, 'terv-figyelmeztetesek-lista');

  // Bevásárlólista: a Beszerzés feladatok
  await page.goto('/utemezett');
  await shotMain(page, 'bevasarlas-utemezett');

  await page.goto('/naptar');
  await page.getByRole('radio', { name: 'Év', exact: true }).click();
  for (const label of ['Vetés, ültetés', 'Palánta, kiültetés', 'Betakarítás', 'Terület felszabadul', 'Saját feladat', 'Napló']) {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await shotMain(page, 'bevasarlas-naptar-ev');

  await page.goto('/het');
  await page.getByRole('button', { name: 'Részletek' }).first().click();
  await shotOf(page, dialog(page, 'Feladat'), 'bevasarlas-feladat');
  await page.keyboard.press('Escape');

  await page.goto('/vetomag');
  await shotMain(page, 'bevasarlas-keszlet');
  await page.getByRole('button', { name: 'Új vetőmag' }).click();
  const sheet = dialog(page, 'Új vetőmag');
  await field(sheet, 'Növény').selectOption({ label: 'Paprika' });
  await field(sheet, 'Fajta').selectOption({ label: 'Kalocsai' }).catch(() => field(sheet, 'Új fajta neve').fill('Kalocsai'));
  await field(sheet, 'Évjárat').fill('2026');
  await shotOf(page, sheet, 'bevasarlas-uj-mag');
  await sheet.getByRole('button', { name: 'Kész', exact: true }).click();
  await sheet.waitFor({ state: 'hidden' });
  await page.goto('/het');
  await shotMain(page, 'bevasarlas-utana');

  await ctx.close();
}

/** A kertben, telefonról: 2027. május 10. */
async function season(browser: Browser) {
  await startServer(true);
  const ctx = await context(browser, 'phone', SEASON_DAY);
  const page = await ctx.newPage();

  await page.goto('/');
  await shot(page, 'kezdes-telefon');

  await page.goto('/het');
  await shot(page, 'kert-ez-a-het');

  await page.getByRole('checkbox', { name: 'Csigacsapdák kihelyezése' }).click();
  await shot(page, 'kert-pipalas');

  const bean = page.getByText('Bokorbab vetése', { exact: true });
  await bean.scrollIntoViewIfNeeded();
  await infoOf(page, 'Bokorbab vetése').click();
  await shot(page, 'kert-feladat');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Új feladat' }).first().click();
  const custom = dialog(page, 'Új feladat');
  await custom.getByPlaceholder('pl. Komposzt átforgatása').fill('Paradicsom kötözése');
  await field(custom, 'Ágyás').selectOption({ label: '1. ágyás' });
  await shot(page, 'kert-uj-feladat');
  await page.keyboard.press('Escape');

  await infoOf(page, 'Saláta betakarításának kezdete').click();
  await page.getByRole('button', { name: 'Termés rögzítése a naplóba' }).click();
  await shot(page, 'kert-termes');
  await page.keyboard.press('Escape');

  await page.goto('/agyas/3');
  await shot(page, 'kert-agyas');

  await ctx.close();
}

/** A feladatsor ⓘ gombja a cím alapján. */
const infoOf = (page: Page, title: string) =>
  page
    .getByRole('checkbox', { name: title, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "_row_")][1]')
    .getByRole('button', { name: 'Részletek' });

/** Űrlapmező a sor felirata alapján (mint az e2e tesztben). */
const field = (scope: Locator, label: string) =>
  scope
    .locator('label')
    .filter({ has: scope.page().getByText(label, { exact: true }) })
    .locator('input, select, textarea')
    .first();

/** A JPEG képpontmérete a fájl fejlécéből (SOF szakasz). */
function jpegSize(path: string): [number, number] {
  const b = readFileSync(path);
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error(`Nem olvasható JPEG: ${path}`);
}

/** A képek mérete a Súgó oldalnak: így betöltés előtt is lefoglalja a helyüket, nem ugrál az oldal. */
function writeSizes() {
  const sizes = Object.fromEntries(
    readdirSync(OUT)
      .filter((f) => f.endsWith('.jpg'))
      .sort()
      .map((f) => [f, jpegSize(`${OUT}/${f}`)]),
  );
  writeFileSync('src/client/features/help/shotSizes.json', `${JSON.stringify(sizes, null, 2)}\n`);
}

// --- Futtatás ------------------------------------------------------------------

const only = process.argv.find((a) => a.startsWith('--csak='))?.slice('--csak='.length);
if (!process.argv.includes('--no-build')) execSync('npm run build', { stdio: 'inherit' });
mkdirSync(OUT, { recursive: true });
// A régi képek törlése, hogy ne maradjon a mappában már nem használt kép
if (!only) for (const f of readdirSync(OUT)) if (f.endsWith('.jpg')) rmSync(`${OUT}/${f}`);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
try {
  if (!only || only === 'tervezes') {
    console.log('Tervezés (2027-02-15, asztal)');
    await planning(browser);
  }
  if (!only || only === 'kert') {
    console.log('A kertben (2027-05-10, telefon)');
    await season(browser);
  }
  writeSizes();
} finally {
  await browser.close();
  await stopServer();
}
