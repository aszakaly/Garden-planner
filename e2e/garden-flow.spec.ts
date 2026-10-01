import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * A teljes tervezési folyamat a specifikáció 14. pontja szerint, üres adatbázison:
 * fajta és vetőmag → ágyás → múltbeli előzmény → éves terv ellenőrzésekkel → feladat a
 * listán és a naptárban → pipálás → naplóbejegyzés → következő év javaslatai.
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
    await page.getByRole('button', { name: 'Új ültetés' }).click();
    let sheet = dialog(page, 'Új ültetés');
    await field(sheet, 'Növény').selectOption({ label: 'Paradicsom' });
    await field(sheet, 'Fajta').selectOption({ label: 'Ökörszív' });
    // Burgonyafélék után burgonyafélék: a 2025-ös, csak évvel rögzített előzmény is számít
    await expect(sheet.getByText(/legalább 3 évnek kell eltelnie.*2025-ben burgonya volt itt/)).toBeVisible();
    await confirm(sheet);

    await page.getByRole('button', { name: 'Új ültetés' }).click();
    sheet = dialog(page, 'Új ültetés');
    await field(sheet, 'Növény').selectOption({ label: 'Gumós édeskömény' });
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
    const plantingSheet = dialog(page, 'Paradicsom – Ökörszív');
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

    const sheet = dialog(page, 'Mi kerülhet ide?');
    // 2027-ben természöldség (paradicsom) állt itt → a forgóban gyökérzöldség következik
    const first = sheet.getByRole('button').filter({ hasText: 'Most gyökérzöldség következik' }).first();
    await expect(first).toBeVisible();
    // Ugyanabból a családból (burgonyafélék) egy év múlva: kerülendő
    await sheet.getByRole('button', { name: /Kerülendők megjelenítése/ }).click();
    await expect(sheet.getByRole('button', { name: /^Paprika/ })).toContainText('Családi szünet');

    // A javaslatból kitöltött új ültetés nyílik
    const plantName = (await first.locator('span').nth(2).textContent())!.split(' – ')[0]!.trim();
    await first.click();
    const planting = dialog(page, 'Új ültetés');
    await expect(field(planting, 'Növény').locator('option:checked')).toHaveText(plantName);
    await expect(field(planting, 'Ágyás')).toHaveValue(/\d+/);
    await confirm(planting);
    await expect(page.getByRole('button', { name: new RegExp(`^${plantName}`) }).first()).toBeVisible();
  });
});
