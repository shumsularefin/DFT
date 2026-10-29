import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = '/handbook/01-why-dft/';
const TOPICS = [
  'why-simulate-materials',
  'the-ladder-of-methods',
  'what-dft-can-and-cannot-tell-you',
  'your-roadmap-to-a-first-vasp-project',
];
const LADDER = `${BASE}the-ladder-of-methods/`;

async function ready(page: Page, url: string) {
  await page.goto(url);
  // the lab island hydrates when it scrolls into view (client:visible)
  const lab = page.locator('[data-lab-id]');
  if (await lab.count()) await lab.first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}

test.describe('module 1', () => {
  for (const t of TOPICS) {
    test(`${t}: nine-part anatomy, no horizontal scroll, axe clean`, async ({ page }) => {
      await ready(page, `${BASE}${t}/`);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings).toContain('Check your understanding');
      expect(headings.at(-1)).toBe('Go deeper');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('lab: badge, text description, keyboard operation, reset', async ({ page }) => {
    await ready(page, LADDER);
    const lab = page.locator('[data-lab-id="cost-of-exactness"]');
    await lab.scrollIntoViewIfNeeded();
    await expect(lab.getByText('Illustrative').first()).toBeVisible();
    await expect(lab.getByText('Text description.')).toBeVisible();
    const slider = lab.getByRole('slider');
    const dft = lab.getByLabel(/DFT \(Kohn-Sham\)/);
    await expect(dft).toBeChecked();
    await expect(lab.getByText('Relative cost at this size').locator('..')).toContainText('10^3.0');
    await expect(lab.getByText(/If the size doubles/).locator('..')).toContainText('8');
    // keyboard: arrow keys move the slider, radio arrows change the method
    await slider.focus();
    await slider.press('End');
    await expect(lab.getByText('Relative cost at this size').locator('..')).toContainText('10^6.0');
    await dft.focus();
    await page.keyboard.press('ArrowDown');
    await expect(lab.getByLabel(/Hartree-Fock/)).toBeChecked();
    await expect(lab.getByText(/If the size doubles/).locator('..')).toContainText('16');
    // qualitative curves claim no number
    await lab.getByLabel(/Exact solution/).check();
    await expect(lab.getByText('Relative cost at this size').locator('..')).toContainText('shape only');
    await expect(lab.getByText(/If the size doubles/).locator('..')).toContainText('qualitative');
    await lab.getByRole('button', { name: 'Reset' }).click();
    await expect(dft).toBeChecked();
    await expect(slider).toHaveValue('1');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the "show all methods" switch hides the other curves', async ({ page }) => {
    await ready(page, LADDER);
    const lab = page.locator('[data-lab-id="cost-of-exactness"]');
    const paths = lab.locator('svg.costlab-svg g[clip-path] path');
    await expect(paths).toHaveCount(7);
    await lab.getByRole('switch', { name: /Show all methods/ }).click();
    await expect(paths).toHaveCount(1);
  });

  test('the module appears in the handbook map and the glossary terms resolve', async ({ page }) => {
    await page.goto('/handbook/');
    await expect(page.getByRole('heading', { name: /Why DFT exists/ })).toBeVisible();
    for (const t of TOPICS) await expect(page.locator(`a[href="${BASE}${t}/"]`)).toBeVisible();
    await ready(page, `${BASE}why-simulate-materials/`);
    expect(await page.locator('.term, [data-term]').count()).toBeGreaterThan(3);
  });
});
