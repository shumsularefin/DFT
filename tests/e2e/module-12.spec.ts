import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// M15.7: every module 12 topic has the page anatomy, no sideways scroll at 360 px, and is axe clean.
const BASE = '/handbook/12-properties/';
const TOPICS = [
  'elastic-constants',
  'equation-of-state',
  'phonons',
  'dielectric-tensor',
  'optical-properties',
  'bader-charges',
  'other-calculations',
];

async function ready(page: Page, url: string) {
  await page.goto(url);
  for (let pass = 0; pass < 400; pass++) {
    const remaining = await page.locator('astro-island[ssr]').count();
    if (remaining === 0) break;
    await page
      .locator('astro-island[ssr]')
      .first()
      // Bounded: the island can hydrate between count() and this call, and an unbounded wait for an element
      // that no longer matches would hang until the test timeout (the module 5 flake of Q-052).
      .scrollIntoViewIfNeeded({ timeout: 1000 })
      .catch(() => {});
    await page.waitForTimeout(50); // keeps scrolling the next unhydrated island into view; the test timeout is the real bound
  }
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe.configure({ timeout: 90_000 });

test.describe('module 12', () => {
  for (const t of TOPICS) {
    test(`${t}: anatomy, no horizontal scroll at 360 px, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await ready(page, `${BASE}${t}/`);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings).toContain('Check your understanding');
      expect(headings.at(-1)).toBe('Go deeper');
      expect(await noOverflow(page)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
});
