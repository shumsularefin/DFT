import { expect, test } from '@playwright/test';

test('landing page and offline fallback work with the network off', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  // wait until the worker controls the page (clientsClaim)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('DFT Handbook');

  // a page that was never visited falls back to /offline/
  await page.goto('/never-visited/').catch(() => {});
  await expect(page.locator('h1')).toHaveText('You are offline');
  await context.setOffline(false);
});
