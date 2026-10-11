import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * A teljes tervezési folyamat a specifikáció 14. pontja szerint, üres adatbázison:
 * fajta és vetőmag → ágyás → múltbeli előzmény → éves terv ellenőrzésekkel → feladat a
 * listán és a naptárban → pipálás → naplóbejegyzés → következő év javaslatai → ágyás
 * másolása és kiosztása.
 * A böngésző órája 2027. március 15-re van állítva, így minden dátum kiszámítható.
 */

const TODAY = new Date('2027-03-15T09:00:00');
const SOW_TASK = 'Paradicsom vetése palántának';
const JOURNAL_TEXT = 'Első szedés: édes, lédús, repedés nélkül';

/** Űrlapmező a sor felirata alapján (a FormRow egy <label>, benne a felirat és a vezérlő). */
const field = (scope: Locator, label: string) =>
  scope
    .locator('label')
    .filter({ has: scope.page().getByText(label, { exact: true }) })
    .locator('input, select, textarea')
    .first();

const dialog = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });

async function confirm(sheet: Locator, label = 'Kész') {
  await sheet.getByRole('button', { name: label, exact: true }).click();
  await expect(sheet).toBeHidden();
}

test('teljes tervezési folyamat: tervtől a naplóig és a következő évig', async ({ page }) => {
  await page.clock.setFixedTime(TODAY);

  await test.step('1–2. fajta kiválasztása és vetőmag rögzítése', async () => {
    await page.goto('/vetomag');
    await page.getByRole('button', { name: 'Új vetőmag' }).click();
    const sheet = dialog(page, 'Új vetőmag');
    await field(sheet, 'Növény').selectOption({ label: 'Paradicsom' });
    // Fajta nélküli növénynél egyből az új fajta neve kell
    await field(sheet, 'Új fajta neve').fill('Ökörszív');
    await field(sheet, 'Évjárat').fill('2026');
    await confirm(sheet);
    await expect(page.getByText('Ökörszív').first()).toBeVisible();
  });

  await test.step('3. ágyás létrehozása', async () => {
    await page.goto('/kert');
    await page.getByRole('button', { name: 'Új ágyás' }).click();
    const sheet = dialog(page, 'Új ágyás');
    await field(sheet, 'Név').fill('E2E ágyás');
    await field(sheet, 'Hossz').fill('300');
    await field(sheet, 'Szélesség').fill('120');
    await confirm(sheet);
    await page.getByRole('navigation', { name: 'Listák' }).getByRole('link', { name: /E2E ágyás/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'E2E ágyás' })).toBeVisible();
  });

  await test.step('9. múltbeli (2025-ös) előzmény gyors rögzítése csak évvel', async () => {
    await page.getByRole('button', { name: 'Előzmény rögzítése' }).click();
    const sheet = dialog(page, 'Előzmény rögzítése');
    await field(sheet, 'Év').selectOption('2025');
    await field(sheet, '1. növény').selectOption({ label: 'Burgonya' });
    await confirm(sheet);
    await expect(page.getByRole('button', { name: /^Burgonya/ })).toBeVisible();
  });

  await test.step('4–5. 2027-es terv: vetésforgó-figyelmeztetés és piros társítási jelzés', async () => {
    // Az ágyáshoz nem kötött új ültetés az Éves terv oldaláról, a teljes ültetési lappal
    await page.goto('/terv');
    await page.getByRole('button', { name: 'Új ültetés', exact: true }).click();
    let sheet = dialog(page, 'Új ültetés');
    await field(sheet, 'Növény').selectOption({ label: 'Paradicsom' });
    await field(sheet, 'Fajta').selectOption({ label: 'Ökörszív' });
    await field(sheet, 'Ágyás').selectOption({ label: 'E2E ágyás' });
    // Burgonyafélék után burgonyafélék: a 2025-ös, csak évvel rögzített előzmény is számít
    await expect(sheet.getByText(/legalább 3 évnek kell eltelnie.*2025-ben burgonya volt itt/)).toBeVisible();
    await confirm(sheet);

    await page.getByRole('button', { name: 'Új ültetés', exact: true }).click();
    sheet = dialog(page, 'Új ültetés');
    await field(sheet, 'Növény').selectOption({ label: 'Gumós édeskömény' });
    await field(sheet, 'Ágyás').selectOption({ label: 'E2E ágyás' });
    await expect(sheet.getByText(/Kerülendő szomszéd: paradicsom közvetlenül mellette áll/)).toBeVisible();
    await confirm(sheet);

    await page.goto('/figyelmeztetesek');
    await expect(page.getByText(/Kerülendő szomszéd/).first()).toBeVisible();
    await expect(page.getByText(/2025-ben burgonya volt itt/).first()).toBeVisible();
  });

  await test.step('6. a feladat a helyes hónapban és a naptár megfelelő napján', async () => {
    await page.goto('/utemezett');
    const march = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Március/ }) });
    await expect(march.getByText(SOW_TASK)).toBeVisible();

    await page.goto('/naptar');
    await expect(page.getByRole('gridcell', { name: /^március 15\./ })).toContainText(SOW_TASK);
  });

  await test.step('7. pipálás: a tény dátuma rögzül', async () => {
    await page.goto('/het');
    await page.getByRole('checkbox', { name: SOW_TASK }).click();
    await expect
      .poll(async () => {
        const items = await (await page.request.get('/api/plantings?year=2027')).json();
        const tomato = items.find((p: { plant_name: string }) => p.plant_name === 'Paradicsom');
        return { sow: tomato.actual_sow_date, status: tomato.status };
      })
      .toEqual({ sow: '2027-03-15', status: 'folyamatban' });
  });

  await test.step('8. naplóbejegyzés az ültetéshez: termés, minőség, megjegyzés', async () => {
    await page.goto('/terv');
    await page.getByRole('button', { name: /^Paradicsom – Ökörszív/ }).first().click();
    // Az ágyásban álló ültetés a munkalapon nyílik, kijelölve; a tény és a napló külön lapon
    await expect(page).toHaveURL(/\/agyas\/\d+$/);
    const panel = page.getByRole('complementary', { name: 'Részletek' });
    await expect(panel.getByRole('heading', { name: /^Paradicsom – Ökörszív/ })).toBeVisible();
    await panel.getByRole('button', { name: /^Tény és napló/ }).click();
    const plantingSheet = dialog(page, 'Paradicsom – Ökörszív');
    await expect(plantingSheet.getByRole('radio', { name: 'Terv' })).toHaveCount(0);
    await expect(plantingSheet.getByText('Vetés (palántának)')).toBeVisible();
    await plantingSheet.getByRole('radio', { name: 'Napló' }).click();
    await plantingSheet.getByRole('button', { name: 'Új bejegyzés' }).click();

    const entry = dialog(page, 'Új bejegyzés');
    await entry.getByRole('radio', { name: 'Termés' }).click();
    await field(entry, 'Szöveg').fill(JOURNAL_TEXT);
    await entry.getByRole('spinbutton', { name: 'Mennyiség' }).fill('2.5');
    await entry.getByRole('radio', { name: '5 csillag' }).click();
    await confirm(entry, 'Hozzáadás');
    await expect(plantingSheet.getByText(JOURNAL_TEXT)).toBeVisible();
    await expect(plantingSheet.getByText(/Összes rögzített termés: 2,5 kg/)).toBeVisible();
    await plantingSheet.getByRole('button', { name: 'Mégse' }).click();

    // A Naplóban, ékezet nélküli kereséssel is
    await page.getByRole('searchbox', { name: 'Keresés a naplóban' }).first().fill('ledus');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/naplo\?q=ledus/);
    await expect(page.getByText(JOURNAL_TEXT)).toBeVisible();

    // A naptárban a nap eseményei között
    await page.goto('/naptar');
    await expect(page.getByRole('gridcell', { name: /^március 15\./ })).toContainText('Termés: paradicsom');

    // A fajta adatlapján
    await page.goto('/novenyek');
    await page.getByRole('link', { name: /^Paradicsom/ }).first().click();
    await page.getByRole('link', { name: /Ökörszív/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ökörszív' })).toBeVisible();
    await expect(page.getByText(JOURNAL_TEXT)).toBeVisible();
    await expect(page.getByText('2,5 kg').first()).toBeVisible();
  });

  await test.step('10. 2028-as terv: a javaslat a tényleges előzményt veszi figyelembe', async () => {
    await page.getByLabel('Tervezési év').selectOption('2028');
    await page.goto('/terv');
    await expect(page.getByText('Ebben az évben (2028) még nincs tervezett ültetés')).toBeVisible();
    await page.getByRole('button', { name: 'Mi kerülhet ide?' }).click();

    // Az ágyás munkalapja nyílik, javaslatlistával az egész ágyásra
    const panel = page.getByRole('complementary', { name: 'Részletek' });
    await expect(panel.getByRole('heading', { name: 'Mi kerülhet az ágyásba?' })).toBeVisible();
    // 2027-ben természöldség (paradicsom) állt itt → a forgóban gyökérzöldség következik
    const first = panel.getByRole('button').filter({ hasText: 'Most gyökérzöldség következik' }).first();
    await expect(first).toBeVisible();
    // Ugyanabból a családból (burgonyafélék) egy év múlva: kerülendő
    await panel.getByRole('button', { name: /Kerülendők megjelenítése/ }).click();
    await expect(panel.getByRole('button', { name: /^Paprika/ })).toContainText('Családi szünet');

    // A javaslat a munkalapra kerül, kijelölve; a Mentés egyben írja
    const plantName = (await first.locator('span').nth(2).textContent())!.split(' – ')[0]!.trim();
    await first.click();
    await expect(panel.getByRole('heading', { name: new RegExp(`^${plantName}`) })).toBeVisible();
    const saveBar = page.getByRole('region', { name: 'Mentetlen módosítások' });
    await saveBar.getByRole('button', { name: 'Mentés' }).click();
    await expect(saveBar).toHaveCount(0);
    await page.goto('/terv');
    await expect(page.getByRole('button', { name: new RegExp(`^${plantName}`) }).first()).toBeVisible();
  });

  await test.step('11. ágyás másolása: több egyforma ágyás egyszerre, sorszámozott névvel', async () => {
    await page.goto('/kert');
    await page.getByRole('main').getByRole('link', { name: /E2E ágyás/ }).click();
    await page.getByRole('button', { name: 'Másolás' }).click();
    const sheet = dialog(page, 'Új ágyás');
    await expect(field(sheet, 'Név')).toHaveValue('E2E ágyás 2');
    await expect(field(sheet, 'Hossz')).toHaveValue('300');
    await field(sheet, 'Darabszám').fill('3');
    await expect(sheet.getByText('3 ágyás jön létre: E2E ágyás 2, E2E ágyás 3, E2E ágyás 4.')).toBeVisible();
    await confirm(sheet);
    await expect(page).toHaveURL(/\/kert$/);
    for (const name of ['E2E ágyás 2', 'E2E ágyás 3', 'E2E ágyás 4']) {
      await expect(page.getByRole('main').getByText(name, { exact: true })).toBeVisible();
    }
  });

  await test.step('12. ágyás-munkalap: paradicsom–bazsalikom–paradicsom javaslatokból, méretezés húzással', async () => {
    await page.getByRole('main').getByText('E2E ágyás 2', { exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'E2E ágyás 2' })).toBeVisible();
    const stage = page.getByRole('region', { name: 'Ágyás kiosztása' });
    const panel = page.getByRole('complementary', { name: 'Részletek' });
    // Más évben a fővetemény napja nyílik, kijelölés nélkül: a panel az áttekintés
    await expect(stage.getByRole('button', { name: /^Fővetemény/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByRole('heading', { name: 'Az ágyás áttekintése' })).toBeVisible();

    // Szabad helyre kattintva javaslat; a keresőből bármelyik növény felvehető
    const pick = async (gap: RegExp, plant: string) => {
      await stage.getByRole('button', { name: gap }).click();
      await expect(panel.getByRole('heading', { name: 'Mi kerülhet ide?' })).toBeVisible();
      await panel.getByRole('searchbox', { name: 'Növény keresése' }).fill(plant);
      await panel.getByRole('button', { name: new RegExp(`^${plant}`) }).first().click();
    };
    // A dátum a vetési naptárból, a szélesség a sortávból jön (paradicsom: 80 cm, bazsalikom: kb. 60 cm-nyi sor)
    await pick(/^Szabad · 300 cm/, 'Paradicsom');
    await expect(stage.getByText('0–80 cm', { exact: true })).toBeVisible();
    await pick(/^Szabad · 220 cm/, 'Bazsalikom');
    await expect(stage.getByText('80–140 cm', { exact: true })).toBeVisible();
    await expect(panel.getByText(/Jó szomszéd: paradicsom/)).toBeVisible();

    await stage.getByRole('button', { name: /^Paradicsom/ }).click();
    await panel.getByRole('button', { name: 'Még egy sáv ebből' }).click();
    await expect(stage.getByText('140–220 cm', { exact: true })).toBeVisible();

    // A bazsalikom sávjának vége 15 cm-rel tovább: a mellette álló paradicsom enged
    await stage.getByRole('button', { name: /^Bazsalikom/ }).click();
    const bedBox = (await stage.locator('[data-layout-bed]').boundingBox())!;
    const pxPerCm = bedBox.width / 300;
    const handle = (await stage.locator('[data-handle="axisEnd"]').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 15 * pxPerCm, y, { steps: 5 });
    await page.mouse.up();
    await expect(stage.getByText('80–155 cm', { exact: true })).toBeVisible();
    await expect(stage.getByText('155–220 cm', { exact: true })).toBeVisible();

    // Mentés-sáv: egyben ment
    await expect(page.getByRole('region', { name: 'Mentetlen módosítások' })).toContainText('3 nem mentett módosítás');
    await page.getByRole('button', { name: 'Mentés', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Mentetlen módosítások' })).toBeHidden();
    await expect
      .poll(async () => {
        const items: { bed_name: string; plant_name: string; axis_start_cm: number; axis_span_cm: number }[] = await (
          await page.request.get('/api/plantings?year=2028')
        ).json();
        return items
          .filter((p) => p.bed_name === 'E2E ágyás 2')
          .sort((a, b) => a.axis_start_cm - b.axis_start_cm)
          .map((p) => [p.plant_name, p.axis_start_cm, p.axis_span_cm]);
      })
      .toEqual([
        ['Paradicsom', 0, 80],
        ['Bazsalikom', 80, 75],
        ['Paradicsom', 155, 65],
      ]);
  });

  await test.step('13. figyelmeztetésből a munkalapra: a kerülendő kiváltása cserével, újravetés, mentés', async () => {
    await page.getByLabel('Tervezési év').selectOption('2027');
    await page.goto('/figyelmeztetesek');
    await page.getByRole('button', { name: /^Paradicsom – Ökörszív.*Kerülendő szomszéd: gumós édeskömény/ }).click();

    // A munkalap nyílik, az ültetés kijelölve, a napja odaállítva; mentetlen módosítás nincs
    await expect(page).toHaveURL(/\/agyas\/\d+$/);
    const stage = page.getByRole('region', { name: 'Ágyás kiosztása' });
    const panel = page.getByRole('complementary', { name: 'Részletek' });
    await expect(panel.getByRole('heading', { name: /^Paradicsom – Ökörszív/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Mentetlen módosítások' })).toBeHidden();
    // A szomszéd az év ültetései között: a sorára kattintva kijelölődik, a nap is odaáll
    await expect(stage.getByRole('button', { name: /^Gumós édeskömény/ })).toHaveCount(0);
    await page.getByRole('button', { name: /^Megnyitás/ }).click();
    await page.getByRole('button', { name: /^Gumós édeskömény/ }).click();
    await expect(panel.getByRole('heading', { name: /^Gumós édeskömény/ })).toContainText('Kerülendő');
    await expect(stage.getByRole('button', { name: /^Gumós édeskömény/ })).toHaveAttribute('aria-pressed', 'true');

    // „Mi kerülhetne ide helyette?”: a hely marad, a figyelmeztetés eltűnik
    await panel.getByRole('button', { name: 'Mi kerülhetne ide helyette?' }).click();
    await expect(panel.getByRole('heading', { name: 'Mi kerülhetne ide helyette?' })).toBeVisible();
    const first = panel.getByRole('button').filter({ hasText: /\d+ sor ·/ }).first();
    const plantName = (await first.locator('span').nth(2).textContent())!.split(' – ')[0]!.trim();
    expect(plantName).not.toBe('Gumós édeskömény');
    await first.click();
    const heading = panel.getByRole('heading', { name: new RegExp(`^${plantName}`) });
    await expect(heading).toBeVisible();
    await expect(heading).not.toContainText('Kerülendő');

    // Újravetés: 3 vetés 3 hetente, a tagok azonnal a piszkozatba kerülnek
    await panel.getByRole('switch', { name: 'Újravetés' }).click();
    await field(panel, 'Vetések száma').fill('3');
    await field(panel, 'Időköz').fill('21');
    await expect(panel.getByRole('button', { name: /^3\. vetés/ })).toBeVisible();

    const saveBar = page.getByRole('region', { name: 'Mentetlen módosítások' });
    await saveBar.getByRole('button', { name: 'Mentés' }).click();
    await expect(saveBar).toBeHidden();
    await expect
      .poll(async () => {
        const items: { plant_name: string; bed_name: string; series_id: string | null; series_index: number | null }[] = await (
          await page.request.get('/api/plantings?year=2027')
        ).json();
        const mine = items.filter((p) => p.bed_name === 'E2E ágyás');
        const members = mine.filter((p) => p.plant_name === plantName);
        return {
          fennel: mine.some((p) => p.plant_name === 'Gumós édeskömény'),
          series: new Set(members.map((p) => p.series_id)).size === 1 && members[0]?.series_id != null,
          indexes: members.map((p) => p.series_index).sort(),
        };
      })
      .toEqual({ fennel: false, series: true, indexes: [1, 2, 3] });
  });
});
