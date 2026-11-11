import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

  test('SCF lab: honest badge, converges, playback by keyboard, mixing, toggle, reset', async ({ page }) => {
    await ready(page, `${BASE}the-scf-loop/`);
    const lab = page.locator('[data-lab-id="scf-loop"]');
    await expect(lab.getByText('Toy model').first()).toBeVisible();
    await expect(lab.getByText(/it is not Kohn-Sham DFT/)).toBeVisible();
    await expect(rd(lab, 'Outcome')).toContainText('Converged');
    await expect(rd(lab, 'Iteration')).toContainText('1 of');
    await lab.getByRole('button', { name: 'Last' }).click();
    // Z = 2 golden total energy -2.224500 hartree (tests/reference/scf1d_reference.json)
    await expect(rd(lab, 'Total energy')).toContainText('-2.224500');
    const it = lab.getByRole('slider', { name: 'Iteration' });
    await it.focus();
    await it.press('Home');
    await expect(rd(lab, 'Iteration')).toContainText('1 of');
    // too much mixing for Z = 1
    await lab.getByLabel('Z = 1').check();
    const mix = lab.getByRole('slider', { name: /Mixing parameter/ });
    await mix.focus();
    await mix.press('End');
    await expect(rd(lab, 'Outcome')).toContainText('Oscillating');
    // no repulsion: one step
    await lab.getByRole('switch', { name: /Electrons repel/ }).click();
    await expect(rd(lab, 'Iteration')).toContainText('1 of 1');
    await lab.getByRole('button', { name: 'Reset' }).click();
    await expect(rd(lab, 'Outcome')).toContainText('Converged');
    expect(await noOverflow(page)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('SCF lab: play runs to the end', async ({ page }) => {
    await ready(page, `${BASE}the-scf-loop/`);
    const lab = page.locator('[data-lab-id="scf-loop"]');
    await lab.getByRole('button', { name: 'Play' }).click();
    await expect(lab.getByText('No: stop.')).toBeVisible({ timeout: 30_000 });
    await expect(lab.getByRole('button', { name: 'Play' })).toBeVisible();
  });
});
