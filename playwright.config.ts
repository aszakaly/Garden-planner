import { defineConfig } from '@playwright/test';

/**
 * Végponttól végpontig tartó teszt a teljes tervezési folyamatra.
 * Saját szervert indít külön porton, minden futáskor üres adatbázissal (data/e2e/),
 * így a valódi adatokhoz nem nyúl. A gépre telepített Chrome-ot használja
 * (PW_CHANNEL=chromium esetén a Playwright saját böngészőjét: npx playwright install chromium).
 */
const PORT = 4351;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? 'chrome',
    locale: 'hu-HU',
    timezoneId: 'Europe/Budapest',
    viewport: { width: 1280, height: 860 },
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `rm -rf data/e2e && npm run build && KERT_PORT=${PORT} KERT_DB=data/e2e/garden.db NODE_ENV=production npx tsx src/server/index.ts`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
  },
});
