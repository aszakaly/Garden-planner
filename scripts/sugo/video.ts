/**
 * A Súgó bemutatóvideója (≤ 3 perc): képernyőfelvétel feliratokkal és aláfestő zenével.
 *
 *   npm run sugo:video                 # build, felvétel, összefűzés
 *   npm run sugo:video -- --no-build
 *
 * Egy „színpad” oldal keretben (iframe) mutatja az alkalmazást – gépi vagy telefonos méretben –,
 * mellette a felirattal és egy látható egérmutatóval. A képet a Chrome képernyőfolyama
 * (CDP screencast) rögzíti; az ffmpeg fűzi össze, és teszi alá a zenét.
 * A szerver és az adatok ugyanazok, mint a képernyőképeknél (kozos.ts, mintakert.ts).
 *
 * Zene: „Morning” – Kevin MacLeod (incompetech.com), CC BY 4.0.
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type CDPSession, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { BASE, PLANNING_DAY, SEASON_DAY, dialog, startServer, stopServer } from './kozos.ts';

const OUT = 'src/client/public/sugo/bemutato.mp4';
const POSTER = 'src/client/public/sugo/bemutato.jpg';
const MUSIC = 'scripts/sugo/zene/morning.mp3';
const WORK = 'data/sugo-video';
const STAGE_URL = `${BASE}/__szinpad`;
/** Olvasási tempó: ennyi karakter másodpercenként, de legalább ennyi ideig marad kint egy felirat. */
const CHARS_PER_SEC = 13;
const MIN_CAPTION_SEC = 3.2;

const STAGE_HTML = `<!doctype html>
<html lang="hu"><head><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #eef0f3;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif; color: #1c1c1e; }
  #app { position: absolute; border: 0; background: #fff; display: none; }
  body.desktop #app { display: block; left: 80px; top: 22px; width: 1440px; height: 760px; border-radius: 14px;
    box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 18px 50px -18px rgba(0,0,0,.35); }
  /* A telefonos rész kisebb színpadon (1280×720) készül, nagyobb nagyítással: így nagyobb a telefon */
  body.phone #app { display: block; left: 250px; top: 22px; width: 390px; height: 676px; border-radius: 42px;
    box-shadow: 0 0 0 11px #1c1c1e, 0 0 0 13px #3a3a3c, 0 30px 70px -20px rgba(0,0,0,.45); }
  #cap { position: absolute; display: flex; flex-direction: column; justify-content: center; }
  body.desktop #cap { left: 80px; right: 80px; top: 790px; height: 100px; align-items: center; text-align: center; }
  body.phone #cap { left: 720px; width: 500px; top: 0; bottom: 0; }
  #chap { font-size: 17px; font-weight: 600; letter-spacing: .02em; color: #248a3d; text-transform: uppercase; }
  body.desktop #chap { display: none; }
  body.phone #chap { margin-bottom: 18px; }
  #text { font-weight: 600; letter-spacing: -.01em; transition: opacity .35s ease; }
  body.desktop #text { font-size: 33px; line-height: 1.25; }
  body.phone #text { font-size: 36px; line-height: 1.25; }
  #text.out { opacity: 0; }
  #card { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center;
    gap: 18px; text-align: center; background: linear-gradient(160deg, #f4fbf5, #e7f4ea); }
  body.card #card { display: flex; }
  body.card #cap { display: none; }
  #card h1 { margin: 0; font-size: 84px; letter-spacing: -.02em; color: #1c1c1e; }
  #card h1 i { font-style: normal; color: #34c759; }
  #card p { margin: 0; font-size: 34px; color: #3c3c43; }
  #card small { font-size: 26px; color: #6e6e73; }
  #cursor { position: absolute; left: 800px; top: 450px; width: 30px; height: 30px; z-index: 10; pointer-events: none;
    transition: left .9s cubic-bezier(.4,0,.2,1), top .9s cubic-bezier(.4,0,.2,1), opacity .3s; opacity: 0; }
  #cursor.on { opacity: 1; }
  #cursor svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  #cursor .ring { position: absolute; left: -16px; top: -16px; width: 32px; height: 32px; border-radius: 50%;
    border: 3px solid #ff9500; opacity: 0; }
  #cursor.tap .ring { animation: ring .55s ease-out; }
  @keyframes ring { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
</style></head>
<body class="card">
  <iframe id="app"></iframe>
  <div id="cap"><div id="chap"></div><div id="text"></div></div>
  <div id="card"></div>
  <div id="cursor"><div class="ring"></div><svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.8L4 20z" fill="#fff" stroke="#1c1c1e" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
</body></html>`;

// --- A színpad vezérlése ---------------------------------------------------------

class Stage {
  readonly app: FrameLocator;
  private shownAt = 0;
  private minSec = 0;

  constructor(readonly page: Page) {
    this.app = page.frameLocator('#app');
  }

  /** Címkártya (nyitó és záró kép). */
  async card(html: string) {
    await this.page.evaluate((h) => {
      document.body.className = 'card';
      document.getElementById('card')!.innerHTML = h;
      document.getElementById('cursor')!.classList.remove('on');
    }, html);
  }

  /** Az alkalmazás betöltése a keretbe, gépi vagy telefonos méretben. */
  async open(mode: 'desktop' | 'phone', path: string, chapter: string) {
    await this.page.evaluate(
      ([m, src, c]) => {
        document.body.className = m!;
        document.getElementById('chap')!.textContent = c!;
        document.getElementById('text')!.textContent = '';
        (document.getElementById('app') as HTMLIFrameElement).src = src!;
      },
      [mode, `${BASE}${path}`, chapter],
    );
    await this.page.waitForTimeout(300);
    await this.app.locator('main, nav').first().waitFor();
    await this.idle();
  }

  /** Navigálás a keretben (mint a címsor átírása, csak a jelenet elején). */
  async goto(path: string) {
    await this.page.evaluate((src) => ((document.getElementById('app') as HTMLIFrameElement).src = src), `${BASE}${path}`);
    await this.page.waitForTimeout(300);
    await this.app.locator('main, nav').first().waitFor();
    await this.idle();
  }

  async idle() {
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForTimeout(250);
  }

  /** Új felirat: kiúsztatja az előzőt (ha az már elég ideig kint volt), majd megjeleníti ezt. */
  async say(text: string, extraSec = 0) {
    await this.hold();
    await this.page.evaluate(async (t) => {
      const el = document.getElementById('text')!;
      if (el.textContent) {
        el.classList.add('out');
        await new Promise((r) => setTimeout(r, 350));
      }
      el.textContent = t;
      el.classList.remove('out');
    }, text);
    this.shownAt = Date.now();
    this.minSec = Math.max(MIN_CAPTION_SEC, text.length / CHARS_PER_SEC) + extraSec;
  }

  /** Megvárja, hogy az aktuális felirat elég ideig kint legyen. */
  async hold() {
    const left = this.shownAt + this.minSec * 1000 - Date.now();
    if (left > 0) await this.page.waitForTimeout(left);
  }

  async pause(sec: number) {
    await this.page.waitForTimeout(sec * 1000);
  }

  /** Az egérmutató az elem közepére (vagy megadott pontjára) úszik. */
  async point(el: Locator, at?: { x: number; y: number }) {
    await el.scrollIntoViewIfNeeded();
    const b = (await el.boundingBox())!;
    const x = b.x + (at ? at.x : b.width / 2);
    const y = b.y + (at ? at.y : b.height / 2);
    await this.page.evaluate(
      ([px, py]) => {
        const c = document.getElementById('cursor')!;
        c.classList.add('on');
        c.style.left = `${px}px`;
        c.style.top = `${py}px`;
      },
      [x, y],
    );
    await this.page.waitForTimeout(1000);
  }

  /** Rámutat, „koppint” (gyűrű), majd valóban rákattint. */
  async tap(el: Locator, at?: { x: number; y: number }) {
    await this.point(el, at);
    await this.page.evaluate(() => {
      const c = document.getElementById('cursor')!;
      c.classList.remove('tap');
      void c.offsetWidth;
      c.classList.add('tap');
    });
    await this.page.waitForTimeout(180);
    await el.click(at ? { position: at } : undefined);
    await this.page.waitForTimeout(500);
    await this.idle();
  }

  /** Lassú görgetés a keretben, hogy az elem a látható rész felső harmadába kerüljön. */
  async scrollTo(el: Locator) {
    await el.evaluate(async (node) => {
      const top = node.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3;
      const from = window.scrollY;
      const to = Math.max(0, top);
      const t0 = performance.now();
      // Névtelen ciklus: a tsx a nevesített belső függvényekhez a böngészőben nem létező segédet tesz
      for (let k = 0; k < 1; ) {
        const t = await new Promise<number>((r) => requestAnimationFrame(r));
        k = Math.min(1, (t - t0) / 900);
        window.scrollTo(0, from + (to - from) * (1 - Math.pow(1 - k, 3)));
      }
    });
    await this.page.waitForTimeout(300);
  }

  /**
   * A kijelölt sáv jobb szélének fogóját az ágyás végéig húzza (az egérmutató is vele megy).
   * A fogók a rajz körei; a jobb szélső, középső az; a cél a rajz legszélesebb téglalapjának jobb széle.
   */
  async dragStripEdge() {
    const frameBox = (await this.page.locator('#app').boundingBox())!;
    const { from, to } = await this.app.locator('main').evaluate(() => {
      const svg = [...document.querySelectorAll('main svg')].find((x) => x.querySelector('circle'))!;
      // A fogók kicsik; a szabad hely „+” ikonja is kör, de nagyobb
      const circles = [...svg.querySelectorAll('circle')].map((c) => c.getBoundingClientRect()).filter((r) => r.width < 16);
      const maxX = Math.max(...circles.map((r) => r.x));
      const right = circles.filter((r) => Math.abs(r.x - maxX) < 2).sort((a, b) => a.y - b.y);
      const handle = right[Math.floor(right.length / 2)]!;
      const bed = [...svg.querySelectorAll('rect')].map((r) => r.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0]!;
      const y = handle.y + handle.height / 2;
      return { from: { x: handle.x + handle.width / 2, y }, to: { x: bed.x + bed.width - 1, y } };
    });
    const at = (p: { x: number; y: number }) => ({ x: frameBox.x + p.x, y: frameBox.y + p.y });
    const a = at(from);
    const b = at(to);
    const move = (x: number, y: number, animate: boolean) =>
      this.page.evaluate(
        ([px, py, an]) => {
          const c = document.getElementById('cursor')!;
          c.classList.add('on');
          c.style.transition = an ? '' : 'none';
          c.style.left = `${px}px`;
          c.style.top = `${py}px`;
        },
        [x, y, animate ? 1 : 0],
      );
    await move(a.x, a.y, true);
    await this.page.waitForTimeout(1000);
    await this.page.mouse.move(a.x, a.y);
    await this.page.mouse.down();
    const steps = 40;
    for (let i = 1; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      await this.page.mouse.move(x, a.y);
      await move(x, a.y, false);
      await this.page.waitForTimeout(30);
    }
    await this.page.mouse.up();
    await move(b.x, b.y, true);
    await this.page.waitForTimeout(800);
    await this.idle();
  }

  /** Lassú gépelés. */
  async type(el: Locator, text: string) {
    await this.tap(el);
    await el.fill('');
    await el.pressSequentially(text, { delay: 70 });
  }
}

// --- Felvétel ------------------------------------------------------------------------

interface Frame {
  data: string;
  t: number;
}

/** Egy jelenetsor felvétele a Chrome képernyőfolyamával, majd 30 fps-es MP4-gyé alakítása. */
async function record(browser: Browser, name: string, day: Date, phone: boolean, scenes: (stage: Stage) => Promise<void>) {
  // Mindkét változat 1920×1080-as képet ad
  const ctx = await browser.newContext({
    viewport: phone ? { width: 1280, height: 720 } : { width: 1600, height: 900 },
    deviceScaleFactor: phone ? 1.5 : 1.2,
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
  });
  await ctx.clock.setFixedTime(day);
  const page = await ctx.newPage();
  await page.route(STAGE_URL, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: STAGE_HTML }));
  await page.goto(STAGE_URL);
  const stage = new Stage(page);

  const frames: Frame[] = [];
  const cdp: CDPSession = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp ?? Date.now() / 1000 });
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080 });

  await scenes(stage);
  await stage.hold();
  await page.waitForTimeout(600);
  const end = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await ctx.close();

  // Képkockák és időtartamuk az ffmpeg concat bemenetéhez
  const dir = `${WORK}/${name}`;
  mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  frames.forEach((f, i) => {
    const file = `${String(i).padStart(5, '0')}.jpg`;
    writeFileSync(`${dir}/${file}`, Buffer.from(f.data, 'base64'));
    const next = frames[i + 1]?.t ?? end;
    lines.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(3)}`);
  });
  lines.push(`file '${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  writeFileSync(`${dir}/list.txt`, `${lines.join('\n')}\n`);
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'scale=1920:1080:flags=lanczos,fps=30,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', `${WORK}/${name}.mp4`]);
  console.log(`  ${name}: ${frames.length} képkocka, ${duration(`${WORK}/${name}.mp4`).toFixed(1)} mp`);
}

function ffmpeg(args: string[]) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

function duration(file: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
}

// --- A jelenetek -------------------------------------------------------------------

const TITLE = `<h1>Kert<i>tervező</i></h1><p>Rövid bemutató</p>
  <small>Tervezés februárban · A kertben, telefonról · Bevásárlólista</small>`;
const END = `<h1>Ennyi az alap.</h1><p>A részletek a Súgóban: <b>Adatok → Súgó</b></p>`;

/** 1. Tervezés februárban – gépen. */
async function planningScene(st: Stage) {
  await st.card(TITLE);
  await st.pause(5);

  await st.open('desktop', '/terv', 'Tervezés februárban');
  const app = st.app;
  const nav = app.getByRole('navigation', { name: 'Listák' });
  await st.say('Februárban megtervezed, mi kerüljön idén az ágyásokba.');
  await st.say('Az Éves terv az egész kertet mutatja, egy idővonalon.');
  await st.point(app.getByText('Sárgarépa', { exact: true }).first());

  await st.say('Nyiss meg egy ágyást. Ez még üres.');
  await st.tap(nav.getByRole('link', { name: /^4\. ágyás/ }));
  await st.say('Jobb oldalon látod, mi következik itt a vetésforgóban.');
  await st.point(app.getByText(/^Javasolt ide/).first());

  await st.say('A „Mi kerülhet ide?” javaslatokat ad, a legjobbak elöl.');
  await st.tap(app.getByText('Mi kerülhet ide?', { exact: true }).first());
  const panel = app.getByRole('complementary', { name: 'Részletek' });
  await st.pause(1.5);
  await st.say('Egy kattintás, és a bokorbab a helyére kerül, a vetési naptár dátumaival.');
  await st.tap(panel.getByText(/^Bokorbab/).first());

  await st.say('A sáv hosszát a széle húzásával állítod.');
  await st.dragStripEdge();

  await st.say('Amíg nem mented, csak vázlat. Mentés.');
  await st.tap(app.getByRole('button', { name: 'Mentés', exact: true }));

  await st.say('Ha valami nem ideális, figyelmeztetést kapsz.');
  await st.tap(nav.getByRole('link', { name: /^1\. ágyás/ }));
  await st.tap(app.getByRole('button', { name: /^Fővetemény/ }));
  await st.say('Itt a paradicsom a tavalyi burgonya helyére került: mindkettő burgonyaféle.', 1);
  await st.point(app.getByText(/^Paradicsom – Ökörszív:/).first());
}

/** 2. A kertben, telefonról. */
async function seasonScene(st: Stage) {
  await st.open('phone', '/', 'A kertben, telefonról');
  const app = st.app;
  await st.say('Szezonban a telefon a fő eszköz, az otthoni Wi-Fi-n.');
  await st.say('Az Ez a hét lista mutatja a következő napok teendőit.');
  await st.tap(app.getByRole('link', { name: /Ez a hét/ }).first());

  await st.say('Ami kész, azt kipipálod.');
  await st.tap(app.getByRole('checkbox', { name: 'Csigacsapdák kihelyezése', exact: true }));

  const bean = app.getByRole('checkbox', { name: 'Bokorbab vetése', exact: true });
  await st.scrollTo(bean);
  await st.say('Ha nem ma csinálod, az ⓘ gombbal áthelyezed másik napra.');
  await st.tap(rowInfo(bean));
  const sheet = dialog(app.locator('body'), 'Feladat');
  await st.point(sheet.getByLabel('Áthelyezés napja'));
  await sheet.getByLabel('Áthelyezés napja').fill('2027-05-14');
  await st.say('A későbbi lépések vele együtt csúsznak.');
  await st.tap(sheet.getByRole('button', { name: 'Kész', exact: true }));

  await st.say('Saját teendőt a + gombbal veszel fel.');
  await app.locator('main').evaluate(() => window.scrollTo(0, 0));
  await st.tap(app.getByRole('button', { name: 'Új feladat' }).first());
  const custom = dialog(app.locator('body'), 'Új feladat');
  await st.type(custom.getByPlaceholder('pl. Komposzt átforgatása'), 'Paradicsom kötözése');
  await st.tap(custom.getByRole('button', { name: 'Hozzáadás', exact: true }));
  const added = app.getByRole('checkbox', { name: 'Paradicsom kötözése', exact: true });
  await st.scrollTo(added);
  await st.point(added);

  const salad = app.getByRole('checkbox', { name: 'Saláta betakarításának kezdete', exact: true });
  await st.scrollTo(salad);
  await st.say('Betakarításkor a termést is felírhatod a naplóba.');
  await st.tap(rowInfo(salad));
  await st.tap(app.getByRole('button', { name: 'Termés rögzítése a naplóba' }));
  const entry = dialog(app.locator('body'), 'Új bejegyzés');
  await st.type(field(st, entry, 'Mennyiség'), '1');
  await st.say('Jövőre ebből látod, mi vált be.');
  await st.tap(entry.getByRole('button', { name: 'Hozzáadás', exact: true }));
}

/** 3. Bevásárlólista – gépen. */
async function shoppingScene(st: Stage) {
  await st.open('desktop', '/utemezett', 'Bevásárlólista');
  const app = st.app;
  const nav = app.getByRole('navigation', { name: 'Listák' });
  await st.say('Bevásárlólista külön nincs: a Beszerzés feladatok mutatják, mit kell venni.', 0.5);
  await st.point(app.getByText(/^Vetőmag beszerzése: retek/).first());

  await st.say('A naptár éves nézetében csak a Beszerzést hagyd bekapcsolva.');
  await st.tap(nav.getByRole('link', { name: /Naptár/ }));
  await st.tap(app.getByRole('radio', { name: 'Év', exact: true }));
  for (const label of ['Vetés, ültetés', 'Palánta, kiültetés', 'Betakarítás', 'Terület felszabadul', 'Saját feladat', 'Napló']) {
    await app.getByRole('button', { name: label, exact: true }).click();
    await st.pause(0.25);
  }
  await st.pause(1.5);

  await st.say('Ha megvetted, vedd fel a Vetőmagkészletbe.');
  await st.tap(nav.getByRole('link', { name: /Vetőmagkészlet/ }));
  await st.tap(app.getByRole('button', { name: 'Új vetőmag' }));
  const sheet = dialog(app.locator('body'), 'Új vetőmag');
  await st.point(field(st, sheet, 'Növény'));
  await field(st, sheet, 'Növény').selectOption({ label: 'Paprika' });
  await st.pause(0.6);
  await field(st, sheet, 'Fajta').selectOption({ label: 'Kalocsai' });
  await st.type(field(st, sheet, 'Évjárat'), '2026');
  await st.tap(sheet.getByRole('button', { name: 'Kész', exact: true }));

  await st.say('A beszerzése magától lekerül a listáról.');
  await st.tap(nav.getByRole('link', { name: /Ez a hét/ }));
  await st.point(app.getByText(/^Vetőmag beszerzése: retek/).first());
  await st.pause(2);

  await st.card(END);
  await st.pause(5);
}

/** Űrlapmező a sor felirata alapján, a kereten belül. */
const field = (st: Stage, scope: Locator, label: string) =>
  scope
    .locator('label')
    .filter({ has: st.app.getByText(label, { exact: true }) })
    .locator('input, select, textarea')
    .first();

/** A feladatsor ⓘ gombja a pipáló alapján. */
const rowInfo = (checkbox: Locator) =>
  checkbox.locator('xpath=ancestor::div[contains(@class, "_row_")][1]').getByRole('button', { name: 'Részletek' });

// --- Összefűzés ----------------------------------------------------------------------

/** A részek összefűzése áttűnéssel, alá a zene (ha rövidebb a videónál, a végét áttűnéssel megismétli). */
function assemble(parts: string[]) {
  const fade = 0.6;
  const lens = parts.map((p) => duration(`${WORK}/${p}.mp4`));
  const inputs = parts.flatMap((p) => ['-i', `${WORK}/${p}.mp4`]);
  // Videó: xfade a részek között
  const filters: string[] = [];
  let last = '[0:v]';
  let offset = lens[0]!;
  for (let i = 1; i < parts.length; i++) {
    offset -= fade;
    const out = i === parts.length - 1 ? '[v]' : `[v${i}]`;
    filters.push(`${last}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${out}`);
    last = out;
    offset += lens[i]!;
  }
  const total = offset;
  // Zene: kétszer egymás után, áttűnéssel; halk, be- és kiúsztatva
  const m = parts.length;
  filters.push(
    `[${m}:a][${m + 1}:a]acrossfade=d=4[mm]`,
    `[mm]atrim=0:${total.toFixed(3)},volume=0.75,afade=t=in:d=1.5,afade=t=out:st=${(total - 4).toFixed(3)}:d=4[a]`,
  );
  ffmpeg([
    ...inputs, '-i', MUSIC, '-i', MUSIC,
    '-filter_complex', filters.join(';'),
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '128k',
    OUT,
  ]);
  // Előnézeti kép a lejátszóhoz: a nyitó kártya
  ffmpeg(['-ss', '2', '-i', OUT, '-frames:v', '1', '-q:v', '3', POSTER]);
  console.log(`Kész: ${OUT} – ${duration(OUT).toFixed(1)} mp`);
}

// --- Futtatás ------------------------------------------------------------------------

/**
 * `--csak=2`: csak ez a rész készül újra (a többi a korábbi felvételből marad), összefűzés nélkül.
 * `--csak=osszefuzes`: felvétel nélkül csak újra összefűzi a meglévő részeket.
 */
const only = process.argv.find((a) => a.startsWith('--csak='))?.slice('--csak='.length);
const PARTS = [
  { name: '1-tervezes', season: false, day: PLANNING_DAY, scenes: planningScene },
  { name: '2-kertben', season: true, day: SEASON_DAY, scenes: seasonScene },
  { name: '3-bevasarlas', season: false, day: PLANNING_DAY, scenes: shoppingScene },
];

if (only !== 'osszefuzes' && !process.argv.includes('--no-build')) execSync('npm run build', { stdio: 'inherit' });
if (!only) rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
try {
  console.log('Felvétel');
  for (const p of PARTS) {
    if (only && !p.name.startsWith(only)) continue;
    rmSync(`${WORK}/${p.name}`, { recursive: true, force: true });
    await startServer(p.season);
    await record(browser, p.name, p.day, p.season, p.scenes);
  }
} finally {
  await browser.close();
  await stopServer();
}
if (!only || only === 'osszefuzes') assemble(PARTS.map((p) => p.name));
