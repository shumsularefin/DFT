import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = '/handbook/05-practical-choices/';
const TOPICS = [
  'plane-waves-and-encut',
  'kpoints-and-the-brillouin-zone',
  'pseudopotentials-and-paw',
  'functionals',
  'smearing',
  'spin-and-magnetism',
  'dft-plus-u',
  'vdw-corrections',
];

async function ready(page: Page, url: string) {
  await page.goto(url);
  const labs = page.locator('[data-lab-id]');
  for (let i = 0; i < (await labs.count()); i++) await labs.nth(i).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const rd = (lab: Locator, label: string) => lab.locator('.lab-readout').filter({ hasText: label });
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const axe = async (page: Page) => expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

test.describe('module 5', () => {
  for (const t of TOPICS) {
    test(`${t}: anatomy, tag links resolve, no horizontal scroll, axe clean`, async ({ page }) => {
      await ready(page, `${BASE}${t}/`);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings.at(-1)).toBe('Go deeper');
      const tags = await page
        .locator('a.tag-link')
        .evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      expect(tags.length).toBeGreaterThan(0);
      for (const h of tags) expect(h).toMatch(/^\/tags\/#[A-Z_]+$/);
      expect(await noOverflow(page)).toBe(true);
      await axe(page);
    });
  }

  test('tag cards page has a card for each linked tag', async ({ page }) => {
    await page.goto('/tags/');
    for (const n of ['ENCUT', 'ISMEAR', 'SIGMA', 'ISPIN', 'MAGMOM', 'LDAUU', 'IVDW', 'KSPACING'])
      await expect(page.locator(`section#${n}`)).toHaveCount(1);
    expect(await noOverflow(page)).toBe(true);
    await axe(page);
  });

  test('smearing lab: Gaussian stays in [0, 1], MP goes outside, entropy check', async ({ page }) => {
    await ready(page, `${BASE}smearing/`);
    const lab = page.locator('[data-lab-id="smearing"]');
    await expect(lab.getByText('Computed').first()).toBeVisible();
    await expect(rd(lab, 'Occupation range')).toContainText('0.000 to 1.000');
    await lab.getByLabel('Methfessel-Paxton order 1').check();
    await expect(rd(lab, 'Occupation range')).toContainText('-0.0');
    const s = lab.getByRole('slider', { name: 'SIGMA' });
    await s.focus();
    await s.press('Home');
    await expect(rd(lab, 'Heuristic check')).toContainText('passes');
    // Methfessel-Paxton's entropy term is tiny even at large SIGMA; Gaussian's is not
    await s.press('End');
    await expect(rd(lab, 'Heuristic check')).toContainText('passes');
    await lab.getByLabel('Gaussian').check();
    await expect(rd(lab, 'Heuristic check')).toContainText('fails');
    await lab.getByRole('button', { name: 'Reset' }).click();
    await expect(lab.getByLabel('Gaussian')).toBeChecked();
    await axe(page);
  });

  test('DFT+U lab: work-order values', async ({ page }) => {
    await ready(page, `${BASE}dft-plus-u/`);
    const lab = page.locator('[data-lab-id="dft-plus-u"]');
    await expect(rd(lab, 'Penalty energy')).toContainText('0.500');
    const n = lab.getByRole('slider', { name: /Occupation n/ });
    await n.focus();
    await n.press('End');
    await expect(rd(lab, 'Penalty energy')).toContainText('0.000');
    await expect(rd(lab, 'Potential shift')).toContainText('-2.000');
    await axe(page);
  });

  test('PAW, ladder and spin labs are labelled Illustrative and keyboard operable', async ({ page }) => {
    await ready(page, `${BASE}pseudopotentials-and-paw/`);
    const paw = page.locator('[data-lab-id="paw-picture"]');
    await expect(paw.getByText('Illustrative').first()).toBeVisible();
    await expect(rd(paw, 'Nodes of the pseudo function')).toContainText('0');

    await ready(page, `${BASE}functionals/`);
    const lad = page.locator('[data-lab-id="functional-ladder"]');
    await expect(lad.getByText('Illustrative').first()).toBeVisible();
    await lad.getByRole('button', { name: '4. Hybrid' }).focus();
    await page.keyboard.press('Enter');
    await expect(rd(lad, 'Adds')).toContainText('exact');

    await ready(page, `${BASE}spin-and-magnetism/`);
    const spin = page.locator('[data-lab-id="spin-cartoon"]');
    await expect(rd(spin, 'MAGMOM')).toContainText('4*5.0 4*0.6');
    await spin.getByLabel(/Antiferromagnetic/).check();
    await expect(rd(spin, 'MAGMOM')).toContainText('5.0 2*-5.0 5.0 4*0.6');
    await axe(page);
  });
});
