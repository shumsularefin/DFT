import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const FIX = 'tests/reference/vasp-outputs';
const PAGES = [
  '09-analysis/energies-and-forces',
  '09-analysis/relaxations',
  '09-analysis/density-of-states',
  '09-analysis/band-structures',
  '09-analysis/charge-density',
];

async function ready(page: Page, url: string) {
  await page.goto(url);
  const islands = page.locator('astro-island');
  for (let i = 0; i < (await islands.count()); i++) await islands.nth(i).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const size of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: '360 px', width: 360, height: 740 },
]) {
  test.describe(`module 9 topics at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    for (const t of PAGES) {
      test(`${t}: anatomy, no horizontal scroll, axe clean`, async ({ page }) => {
        await ready(page, `/handbook/${t}/`);
        const headings = await page.locator('article h2').allInnerTexts();
        expect(headings[0]).toBe('Why this matters');
        expect(headings.at(-1)).toBe('Go deeper');
        expect(await noOverflow(page)).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      });
    }
  });
}

test.describe('viewers', () => {
  test('every viewer starts with no example data', async ({ page }) => {
    for (const [t, id] of [
      ['relaxations', 'relaxation-viewer'],
      ['density-of-states', 'dos-viewer'],
      ['band-structures', 'band-viewer'],
      ['charge-density', 'density-viewer'],
    ] as const) {
      await ready(page, `/handbook/09-analysis/${t}/`);
      await expect(page.locator(`[data-lab-id="${id}"] .av-empty`)).toContainText('ships with no example');
    }
  });

  test('relaxation viewer reads an XDATCAR and steps with the keyboard', async ({ page }) => {
    await ready(page, '/handbook/09-analysis/relaxations/');
    const lab = page.locator('[data-lab-id="relaxation-viewer"]');
    await lab.getByLabel(/^XDATCAR/).setInputFiles(`${FIX}/XDATCAR`);
    await expect(lab.locator('.lab-readout', { hasText: 'Frames in XDATCAR' })).toContainText('3');
    await lab.getByLabel('Ionic step').focus();
    await page.keyboard.press('Home');
    await expect(lab.locator('.lab-readout', { hasText: 'Showing step' })).toContainText('1 of 3');
    await lab.getByRole('button', { name: 'Next step' }).click();
    await expect(lab.locator('.lab-readout', { hasText: 'Showing step' })).toContainText('2 of 3');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('DOS viewer reads a DOSCAR', async ({ page }) => {
    await ready(page, '/handbook/09-analysis/density-of-states/');
    const lab = page.locator('[data-lab-id="dos-viewer"]');
    await lab.getByLabel(/^DOSCAR/).setInputFiles(`${FIX}/DOSCAR_ispin2_lorbit11`);
    await expect(lab.locator('.lab-readout', { hasText: 'Spin channels' })).toContainText('2');
    await expect(lab.locator('svg.av-plot')).toBeVisible();
    await lab.getByRole('switch', { name: /Gaussian smoothing/ }).click();
    await expect(lab.locator('figcaption').first()).toContainText('Gaussian smoothing');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('band viewer reads an EIGENVAL and reports a gap or a metal', async ({ page }) => {
    await ready(page, '/handbook/09-analysis/band-structures/');
    const lab = page.locator('[data-lab-id="band-viewer"]');
    await lab.getByLabel(/^EIGENVAL/).setInputFiles(`${FIX}/EIGENVAL_ispin1`);
    await expect(lab.locator('.lab-readout', { hasText: 'Bands' }).first()).toBeVisible();
    await expect(lab.locator('svg.av-plot')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('density viewer reads a CHGCAR and draws a cross-section', async ({ page }) => {
    await ready(page, '/handbook/09-analysis/charge-density/');
    const lab = page.locator('[data-lab-id="density-viewer"]');
    await lab.getByLabel(/^CHGCAR/).setInputFiles(`${FIX}/CHGCAR_spin`);
    await expect(lab.locator('.lab-readout', { hasText: /^Grid/ })).toContainText('20 x 20 x 24');
    await expect(lab.locator('.lab-readout', { hasText: /^Electrons/ })).toContainText('1.99995');
    await expect(lab.locator('canvas.av-canvas')).toBeVisible();
    await lab.getByLabel('Magnetization').check();
    await expect(lab.locator('.lab-readout', { hasText: 'Integrated magnetization' })).toContainText(
      '0.99997',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('a wrong file gives a message, not a crash', async ({ page }) => {
    await ready(page, '/handbook/09-analysis/band-structures/');
    const lab = page.locator('[data-lab-id="band-viewer"]');
    await lab
      .getByLabel(/^EIGENVAL/)
      .setInputFiles({ name: 'EIGENVAL', mimeType: 'text/plain', buffer: Buffer.from('nope') });
    await expect(lab.getByRole('alert')).toBeVisible();
  });
});
