// Cloud sessions ship a Chromium at /opt/pw-browsers/chromium that does not match the installed
// @playwright/test revision; launching without executablePath fails. VERIFIED 2026-10-27:
// launching with that path works, WebGL is available, axe-core runs.
// Web server: Astro 7's `astro preview` daemonizes when not attached to a terminal, so Playwright
// reported "exited early"; scripts/build/serve.mjs (from serve.mjs.reference) is used instead. VERIFIED.
// axe note: AxeBuilder needs a page created from browser.newContext(); the @playwright/test
// `page` fixture already is one.
import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_PATH || undefined; // set to /opt/pw-browsers/chromium in cloud sessions

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4321', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && node scripts/build/serve.mjs dist 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'mobile-360',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 740 },
        launchOptions: { executablePath, args: ['--no-sandbox'] },
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath, args: ['--no-sandbox'] } },
    },
  ],
});
