// Cloud sessions ship a Chromium at /opt/pw-browsers/chromium that does not match the installed
// @playwright/test revision; launching without executablePath fails. VERIFIED 2026-10-27:
// launching with that path works, WebGL is available, axe-core runs.
// Web server: Astro 7's `astro preview` daemonizes when not attached to a terminal, so Playwright
// reported "exited early"; scripts/build/serve.mjs (from serve.mjs.reference) is used instead. VERIFIED.
// axe note: AxeBuilder needs a page created from browser.newContext(); the @playwright/test
// `page` fixture already is one.
import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_PATH || undefined; // set to /opt/pw-browsers/chromium in cloud sessions
// PW_PORT lets parallel checkouts (git worktrees) each run their own server; default 4321.
const port = Number(process.env.PW_PORT || 4321);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npm run build && node scripts/build/serve.mjs dist ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath, args: ['--no-sandbox'] } },
    },
  ],
});
