import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

interface ScfCase {
  Z: number;
  E_HF: number;
  E_correlation: number;
  iterations: number;
}
const golden = JSON.parse(readFileSync('tests/reference/scf1d_reference.json', 'utf8')) as {
  cases: ScfCase[];
};

const BASE = '/handbook/04-kohn-sham/';
const TOPICS = [
  'hohenberg-kohn-theorems',
  'the-kohn-sham-idea',
  'exchange-and-correlation',
  'the-scf-loop',
  'when-scf-goes-wrong',
];

async function ready(page: Page, url: string) {
  await page.goto(url);
  const lab = page.locator('[data-lab-id]');
  if (await lab.count()) await lab.first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const rd = (lab: Locator, label: string) => lab.locator('.lab-readout').filter({ hasText: label });
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('module 4', () => {
  for (const t of TOPICS) {
    test(`${t}: nine-part anatomy, no horizontal scroll, axe clean`, async ({ page }) => {
      await ready(page, `${BASE}${t}/`);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings).toContain('Check your understanding');
      expect(headings.at(-1)).toBe('Go deeper');
      expect(await noOverflow(page)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

  test('SCF lab: honest label, keyboard only, golden energy, oscillation at Z = 1 and alpha = 1, reset', async ({
    page,
  }) => {
    await ready(page, `${BASE}the-scf-loop/`);
    const lab = page.locator('[data-lab-id="scf-loop"]');
    await expect(lab.getByText('Toy model').first()).toBeVisible();
    await expect(lab.getByText(/It is not Kohn-Sham DFT/)).toBeVisible();
    await expect(lab.getByText('Text description.')).toBeVisible();

    // jump to the last iteration with the keyboard: default Z = 2, alpha = 0.3
    const z2 = golden.cases.find((c) => c.Z === 2)!;
    const it = lab.getByRole('slider', { name: /Show iteration/ });
    await it.focus();
    await it.press('End');
    await expect(rd(lab, 'Iteration')).toContainText(`${z2.iterations} of ${z2.iterations}`);
    await expect(rd(lab, 'Loop behaviour')).toContainText('converged');
    await expect(rd(lab, 'Total energy')).toContainText(z2.E_HF.toFixed(6));
    await expect(rd(lab, 'Correlation energy')).toContainText(z2.E_correlation.toFixed(6));

    // Z = 1 and alpha = 1: the loop oscillates
    await lab.getByRole('radio', { name: 'Z = 1' }).check();
    const a = lab.getByRole('slider', { name: /Mixing alpha/ });
    await a.focus();
    await a.press('End');
    await expect(rd(lab, 'Loop behaviour')).toContainText('oscillating');
    await expect(rd(lab, 'Correlation energy')).toHaveCount(0);

    // repulsion off: one step
    await lab.getByRole('switch', { name: /Non-interacting/ }).press('Enter');
    await expect(rd(lab, 'Iteration')).toContainText('1 of 1');

    await lab.getByRole('button', { name: 'Reset' }).click();
    await expect(rd(lab, 'Iteration')).toContainText(`1 of ${z2.iterations}`);
    expect(await noOverflow(page)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('SCF lab honours reduced motion: no play control', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await ready(page, `${BASE}the-scf-loop/`);
    const lab = page.locator('[data-lab-id="scf-loop"]');
    await expect(lab.getByRole('slider', { name: /Show iteration/ })).toBeVisible();
    await expect(lab.getByRole('switch', { name: /Play the iterations/ })).toHaveCount(0);
    await ctx.close();
  });

  test('the module appears in the handbook map', async ({ page }) => {
    await page.goto('/handbook/');
    for (const t of TOPICS) await expect(page.locator(`a[href="${BASE}${t}/"]`)).toBeVisible();
  });
});
