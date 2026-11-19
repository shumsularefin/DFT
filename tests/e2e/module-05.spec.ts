import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = '/handbook/05-practical-choices/';
const TOPICS = ['plane-waves-and-encut', 'kpoints-and-the-brillouin-zone', 'smearing', 'dft-plus-u'];

async function ready(page: Page, url: string) {
  await page.goto(url);
  const lab = page.locator('[data-lab-id]');
  if (await lab.count()) await lab.first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('module 5 (first half)', () => {
  for (const t of TOPICS) {
    test(`${t}: anatomy, no horizontal scroll, axe clean`, async ({ page }) => {
      await ready(page, `${BASE}${t}/`);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings).toContain('Check your understanding');
      expect(headings.at(-1)).toBe('Go deeper');
      expect(await noOverflow(page)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

  test('smearing lab: toy label, keyboard slider changes the readouts, reset restores', async ({ page }) => {
    await ready(page, `${BASE}smearing/`);
    const lab = page.locator('[data-lab-id="smearing"]');
    await expect(lab.getByText('Toy model').first()).toBeVisible();
    const before = await lab.locator('.lab-readout').allInnerTexts();
    const slider = lab.getByRole('slider').first();
    await slider.focus();
    await slider.press('End');
    const after = await lab.locator('.lab-readout').allInnerTexts();
    expect(after).not.toEqual(before);
    await lab.getByRole('button', { name: /reset/i }).click();
    expect(await lab.locator('.lab-readout').allInnerTexts()).toEqual(before);
  });

  test('DFT+U lab: keyboard slider changes the readouts', async ({ page }) => {
    await ready(page, `${BASE}dft-plus-u/`);
    const lab = page.locator('[data-lab-id="dft-plus-u"]');
    const before = await lab.locator('.lab-readout').allInnerTexts();
    const slider = lab.getByRole('slider').first();
    await slider.focus();
    await slider.press('End');
    expect(await lab.locator('.lab-readout').allInnerTexts()).not.toEqual(before);
  });
});
